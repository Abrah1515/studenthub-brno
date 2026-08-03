import "server-only";
import { createHash } from "node:crypto";

const buckets = new Map<string, number[]>();

export function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return createHash("sha256").update(`${process.env.RATE_LIMIT_SALT || "demo-salt"}:${forwarded}`).digest("hex").slice(0, 24);
}

export function allowRequest(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const active = (buckets.get(key) || []).filter((timestamp) => timestamp > now - windowMs);
  if (active.length >= limit) return false;
  active.push(now);
  buckets.set(key, active);
  return true;
}
