import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function fingerprints() {
  return (process.env.ANDROID_SHA256_CERT_FINGERPRINTS || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value));
}

export async function GET() {
  const packageName = process.env.ANDROID_PACKAGE_ID?.trim();
  const certificateFingerprints = fingerprints();
  const validPackage = Boolean(packageName && /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName));
  const statements = validPackage && certificateFingerprints.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: certificateFingerprints } }]
    : [];
  return NextResponse.json(statements, { headers: { "Cache-Control": "public, max-age=300, must-revalidate", "X-Content-Type-Options": "nosniff" } });
}
