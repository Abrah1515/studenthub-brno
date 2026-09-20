import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { exportStorage, listStorageFiles } from "./export-storage.mjs";
import { validateSupabaseTarget } from "./check-config.mjs";
import { createManifest, verifyManifest } from "./manifest.mjs";
import { keysToPrune } from "./prune-r2.mjs";

async function temporaryDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studenthub-backup-test-"));
  try {
    return await run(directory);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await rm(directory, { recursive: true, force: true });
  }
}

test("Storage export traverses folders and preserves file integrity", async () => {
  await temporaryDirectory(async (directory) => {
    const storage = {
      listBuckets: async () => ({ data: [{ id: "photos", public: false }], error: null }),
      from: () => ({
        list: async (prefix) => ({ data: prefix ? [{ id: "object-2", name: "inside.webp" }] : [{ id: null, name: "folder" }, { id: "object-1", name: "root.webp" }], error: null }),
        download: async (name) => ({ data: new Blob([name]), error: null }),
      }),
    };
    assert.deepEqual(await listStorageFiles(storage, "photos"), ["folder/inside.webp", "root.webp"]);
    const result = await exportStorage(storage, directory);
    assert.equal(result.objectCount, 2);
    const manifest = JSON.parse(await readFile(path.join(directory, "objects.json"), "utf8"));
    assert.equal(manifest.buckets[0].id, "photos");
    for (const object of manifest.objects) {
      const bytes = await readFile(path.join(directory, "objects", object.file));
      assert.equal(bytes.toString(), object.path);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), object.sha256);
    }
  });
});

test("manifest catches changed backup files", async () => {
  await temporaryDirectory(async (directory) => {
    await mkdir(path.join(directory, "database"));
    await mkdir(path.join(directory, "storage", "objects"), { recursive: true });
    for (const name of ["roles", "schema", "data"]) await writeFile(path.join(directory, "database", `${name}.sql`), `${name}\n`);
    await writeFile(path.join(directory, "storage", "objects.json"), '{"buckets":[],"objects":[]}');
    await createManifest(directory);
    assert.equal((await verifyManifest(directory)).storageObjectCount, 0);
    await writeFile(path.join(directory, "database", "data.sql"), "changed\n");
    await assert.rejects(verifyManifest(directory), /checksum mismatch/);
  });
});

test("retention only selects known backup keys", () => {
  const contents = Array.from({ length: 9 }, (_, index) => ({ Key: `studenthub/daily/studenthub-daily-202609${String(index + 1).padStart(2, "0")}T021700Z.tar.gz.age` }));
  contents.push({ Key: "other-project/daily/private.age" }, { Key: "studenthub/daily/notes.txt" });
  assert.deepEqual(keysToPrune(contents, "daily", 7), [
    "studenthub/daily/studenthub-daily-20260902T021700Z.tar.gz.age",
    "studenthub/daily/studenthub-daily-20260901T021700Z.tar.gz.age",
  ]);
});

test("database and Storage must target the same Supabase project", () => {
  const project = "https://project123.supabase.co";
  assert.equal(validateSupabaseTarget(project, "postgresql://postgres.project123:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"), "project123");
  assert.equal(validateSupabaseTarget(project, "postgresql://postgres:secret@db.project123.supabase.co:5432/postgres"), "project123");
  assert.throws(() => validateSupabaseTarget(project, "postgresql://postgres.other:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"), /different Supabase projects/);
  assert.throws(() => validateSupabaseTarget(project, "postgresql://postgres.project123:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"), /wrong pooler mode/);
});
