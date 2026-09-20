import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const pageSize = 100;

async function listPages(loadPage) {
  const entries = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await loadPage(offset);
    if (error) throw new Error(`Supabase Storage listing failed: ${error.message}`);
    if (!Array.isArray(data)) throw new Error("Supabase Storage returned an invalid listing.");
    entries.push(...data);
    if (data.length < pageSize) return entries;
  }
}

export async function listStorageFiles(storage, bucketId) {
  const files = [];
  const pending = [""];
  while (pending.length) {
    const prefix = pending.pop();
    const entries = await listPages((offset) => storage.from(bucketId).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    }));
    for (const entry of entries) {
      if (typeof entry.name !== "string" || !entry.name || entry.name === "." || entry.name === ".." || entry.name.includes("/")) {
        throw new Error(`Invalid object name in bucket ${bucketId}.`);
      }
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) pending.push(objectPath);
      else if (typeof entry.id === "string") files.push(objectPath);
      else throw new Error(`Invalid object entry in bucket ${bucketId}.`);
    }
  }
  return files.sort();
}

export async function exportStorage(storage, destination, maxBytes = 6 * 1024 ** 3) {
  const objectDirectory = path.join(destination, "objects");
  await mkdir(objectDirectory, { recursive: true });
  const buckets = await listPages((offset) => storage.listBuckets({ limit: pageSize, offset, sortColumn: "id", sortOrder: "asc" }));
  if (!buckets.length) throw new Error("No Supabase Storage buckets found; refusing an incomplete backup.");

  const manifest = { buckets: [], objects: [] };
  let totalBytes = 0;
  for (const bucket of buckets) {
    if (typeof bucket.id !== "string" || !bucket.id) throw new Error("Invalid Supabase Storage bucket.");
    manifest.buckets.push({ id: bucket.id, public: bucket.public === true });
    for (const objectPath of await listStorageFiles(storage, bucket.id)) {
      const { data, error } = await storage.from(bucket.id).download(objectPath);
      if (error || !data) throw new Error(`Could not download ${bucket.id}/${objectPath}: ${error?.message ?? "empty response"}`);
      const bytes = Buffer.from(await data.arrayBuffer());
      totalBytes += bytes.length;
      if (totalBytes > maxBytes) throw new Error("Storage backup exceeds the configured size limit.");
      const file = createHash("sha256").update(`${bucket.id}\0${objectPath}`).digest("hex");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await writeFile(path.join(objectDirectory, file), bytes, { mode: 0o600 });
      manifest.objects.push({ bucket: bucket.id, path: objectPath, file, size: bytes.length, sha256 });
    }
  }
  await writeFile(path.join(destination, "objects.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return { bucketCount: buckets.length, objectCount: manifest.objects.length, totalBytes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [destination] = process.argv.slice(2);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!destination || !url || !key) throw new Error("Storage backup configuration is incomplete.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await exportStorage(client.storage, destination);
  console.log(`Storage export complete: ${result.bucketCount} buckets, ${result.objectCount} objects.`);
}
