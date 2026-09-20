import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const policy = { daily: 7, weekly: 4 };

export function keysToPrune(contents, interval, keep) {
  const pattern = new RegExp(`^studenthub/${interval}/studenthub-${interval}-[0-9]{8}T[0-9]{6}Z\\.tar\\.gz\\.age$`);
  const keys = contents
    .filter((item) => typeof item.Key === "string" && pattern.test(item.Key))
    .map((item) => item.Key)
    .sort()
    .reverse();
  return keys.slice(keep);
}

function aws(args) {
  return execFileSync("aws", ["--endpoint-url", process.env.R2_ENDPOINT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

export function prune() {
  const bucket = process.env.R2_BUCKET;
  if (!bucket || !process.env.R2_ENDPOINT) throw new Error("R2 backup configuration is incomplete.");
  for (const [interval, keep] of Object.entries(policy)) {
    const listing = JSON.parse(aws(["s3api", "list-objects-v2", "--bucket", bucket, "--prefix", `studenthub/${interval}/`, "--output", "json"]));
    if (!Array.isArray(listing.Contents) && listing.Contents !== undefined) throw new Error("Invalid R2 object listing.");
    const oldKeys = keysToPrune(listing.Contents ?? [], interval, keep);
    for (const key of oldKeys) aws(["s3api", "delete-object", "--bucket", bucket, "--key", key, "--output", "json"]);
    console.log(`R2 ${interval}: retained ${keep}, removed ${oldKeys.length} older snapshots.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prune();
