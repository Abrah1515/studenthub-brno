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
import { copyCounts, safeObjectPath } from "./restore-verify.mjs";

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
    for (const name of ["roles", "schema", "data", "managed", "history_schema", "history_data"]) await writeFile(path.join(directory, "database", `${name}.sql`), `${name}\n`);
    await writeFile(path.join(directory, "database", "managed.json"), '{"triggerCount":1,"policyCount":1}');
    await writeFile(path.join(directory, "storage", "objects.json"), '{"buckets":[],"objects":[]}');
    await createManifest(directory);
    const manifestPath = path.join(directory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.format, 2);
    assert.equal((await verifyManifest(directory)).storageObjectCount, 0);
    // Existing archives remain verifiable, but the restore runner requires v2 metadata.
    await writeFile(manifestPath, JSON.stringify({ ...manifest, format: 1 }));
    assert.equal((await verifyManifest(directory)).storageObjectCount, 0);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(path.join(directory, "database", "data.sql"), "changed\n");
    await assert.rejects(verifyManifest(directory), /checksum mismatch/);
  });
});

test("new backups require Auth/Storage security metadata and migration history", async () => {
  await temporaryDirectory(async (directory) => {
    await mkdir(path.join(directory, "database"));
    await mkdir(path.join(directory, "storage"));
    for (const name of ["roles", "schema", "data"]) await writeFile(path.join(directory, "database", `${name}.sql`), "-- snapshot\n");
    await writeFile(path.join(directory, "storage", "objects.json"), '{"buckets":[],"objects":[]}');
    await assert.rejects(createManifest(directory), /managed.sql/);
  });
});

test("restore counts COPY rows without treating escaped newlines or terminators as rows", async () => {
  await temporaryDirectory(async (directory) => {
    const file = path.join(directory, "data.sql");
    const sql = 'COPY "public"."profiles" ("id", "bio") FROM stdin;\n1\tline\\nline\n2\t\\\\.\n\\.\nCOPY "auth"."users" ("id") FROM stdin;\n\\.\n';
    await writeFile(file, sql);
    assert.deepEqual([...await copyCounts([file])], [['"public"."profiles"', 2], ['"auth"."users"', 0]]);
    await assert.rejects(copyCounts([file, file]), /Duplicate COPY/);
    await writeFile(file, sql + 'COPY "public"."unfinished" ("id") FROM stdin;\n1\n');
    await assert.rejects(copyCounts([file]), /Incomplete COPY/);
  });
});

test("Storage restore rejects paths escaping its private destination", () => {
  const root = path.join(os.tmpdir(), "studenthub-test-restore");
  assert.equal(safeObjectPath(root, "avatars", "profile/image.webp"), path.join(root, "avatars", "profile", "image.webp"));
  for (const invalid of ["../secret", "/root", "a/../../secret", "a\\secret", "a//b", "."]) assert.throws(() => safeObjectPath(root, "avatars", invalid), /Unsafe Storage/);
  assert.throws(() => safeObjectPath(root, "../bucket", "image.webp"), /Unsafe Storage/);
});

test("isolated restore forbids production credentials and disconnects networking before SQL import", async () => {
  const script = await readFile(new URL("./restore-check.sh", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../../.github/workflows/restore-check.yml", import.meta.url), "utf8");
  assert.match(script, /Production database credentials are forbidden/);
  assert.match(script, /docker network create --internal/);
  assert.ok(script.indexOf('docker network disconnect') < script.indexOf('cat "$restore/roles.sql"'));
  assert.match(script, /cron.launch_active_jobs = 'off'/);
  assert.match(script, /--single-transaction -v ON_ERROR_STOP=1/);
  assert.match(script, /set session_replication_role = replica/);
  assert.match(script, /set session_replication_role = origin/);
  assert.match(script, /restore-verify.mjs/);
  assert.doesNotMatch(workflow, /SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_BACKUP_SECRET_KEY|upload-artifact/);
  assert.match(workflow, /workflows: \[Encrypted Supabase backup\]/);
  assert.match(workflow, /workflow_run.conclusion == 'success'/);
  assert.match(workflow, /workflow_run.head_repository.full_name == github.repository/);
  assert.match(workflow, /workflow_run.head_branch == 'main'/);
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

test("production backup performs an isolated decrypt and manifest restore check", async () => {
  const script = await readFile(new URL("./run.sh", import.meta.url), "utf8");
  assert.match(script, /BACKUP_AGE_IDENTITY/);
  assert.match(script, /AGE-SECRET-KEY-1/);
  assert.match(script, /age --decrypt --identity/);
  assert.match(script, /manifest\.mjs verify "\$restore_dir"/);
  assert.match(script, /restore_dir\/database\/schema\.sql/);
  assert.match(script, /restore_dir\/storage\/objects\.json/);
  assert.doesNotMatch(script, /SUPABASE_DB_URL[^\n]*psql/);
});
