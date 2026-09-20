import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requiredFiles = ["database/roles.sql", "database/schema.sql", "database/data.sql", "storage/objects.json"];

async function walk(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (name === "manifest.json") continue;
    if (entry.isDirectory()) result.push(...await walk(path.join(directory, entry.name), name));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`Unexpected archive entry: ${name}`);
  }
  return result.sort();
}

async function digest(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return { size: (await stat(filePath)).size, sha256: hash.digest("hex") };
}

export async function createManifest(directory) {
  const files = await walk(directory);
  for (const file of requiredFiles) {
    if (!files.includes(file) || (await stat(path.join(directory, file))).size === 0) throw new Error(`Missing or empty backup file: ${file}`);
  }
  const manifest = { format: 1, createdAt: new Date().toISOString(), files: {} };
  for (const file of files) manifest.files[file] = await digest(path.join(directory, file));
  await writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return manifest;
}

export async function verifyManifest(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  if (manifest.format !== 1 || !manifest.files || typeof manifest.files !== "object") throw new Error("Invalid backup manifest.");
  const actual = await walk(directory);
  const expected = Object.keys(manifest.files).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Backup file list differs from manifest.");
  for (const file of requiredFiles) if (!expected.includes(file)) throw new Error(`Missing backup file: ${file}`);
  for (const file of expected) {
    if (path.isAbsolute(file) || file.split("/").some((part) => part === ".." || part === ".")) throw new Error("Invalid manifest path.");
    const actualDigest = await digest(path.join(directory, file));
    if (actualDigest.size !== manifest.files[file].size || actualDigest.sha256 !== manifest.files[file].sha256) throw new Error(`Backup checksum mismatch: ${file}`);
  }
  const storage = JSON.parse(await readFile(path.join(directory, "storage/objects.json"), "utf8"));
  if (!Array.isArray(storage.buckets) || !Array.isArray(storage.objects)) throw new Error("Invalid Storage manifest.");
  if (storage.objects.length !== actual.filter((file) => file.startsWith("storage/objects/")).length) throw new Error("Storage object count mismatch.");
  for (const object of storage.objects) {
    if (typeof object.file !== "string" || !/^[a-f0-9]{64}$/.test(object.file)) throw new Error("Invalid Storage object filename.");
    const file = `storage/objects/${object.file}`;
    if (manifest.files[file]?.sha256 !== object.sha256 || manifest.files[file]?.size !== object.size) throw new Error(`Storage object mismatch: ${file}`);
  }
  return { fileCount: expected.length, storageObjectCount: storage.objects.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, directory] = process.argv.slice(2);
  if (!directory || !["create", "verify"].includes(command)) throw new Error("Usage: node manifest.mjs create|verify DIRECTORY");
  const result = command === "create" ? await createManifest(directory) : await verifyManifest(directory);
  console.log(command === "create" ? `Backup manifest created with ${Object.keys(result.files).length} files.` : `Backup manifest verified: ${result.fileCount} files.`);
}
