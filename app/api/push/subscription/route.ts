import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { deleteRecord, insertRecord, listRecords, updateRecord } from "@/lib/data-store";
import { ensureInstallation, installationCookie } from "@/lib/installation";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { pushSubscriptionSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!allowRequest(`push-subscribe:${requestFingerprint(request)}`, 12, 60 * 60 * 1000)) return NextResponse.json({ message: "Příliš mnoho změn push nastavení." }, { status: 429 });
  const parsed = pushSubscriptionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Neplatné push přihlášení." }, { status: 422 });
  const { identity, row: installation } = await ensureInstallation(request); const input = parsed.data; const endpointHash = createHash("sha256").update(input.endpoint).digest("hex");
  const existing = (await listRecords("push_subscriptions")).find((row) => row.endpoint_hash === endpointHash);
  const values = { installation_id: installation.id, endpoint: input.endpoint, endpoint_hash: endpointHash, p256dh: input.keys.p256dh, auth_secret: input.keys.auth, expiration_time: input.expirationTime || null, enabled: true, failure_count: 0 };
  if (existing) await updateRecord("push_subscriptions", String(existing.id), values); else await insertRecord("push_subscriptions", values);
  const response = NextResponse.json({ enabled: true }); installationCookie(response, identity); return response;
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null) as { endpoint?: string } | null; if (!body?.endpoint) return NextResponse.json({ message: "Chybí push endpoint." }, { status: 422 });
  const { identity, row: installation } = await ensureInstallation(request); const endpointHash = createHash("sha256").update(body.endpoint).digest("hex");
  const existing = (await listRecords("push_subscriptions")).find((row) => row.installation_id === installation.id && row.endpoint_hash === endpointHash);
  if (existing) await deleteRecord("push_subscriptions", String(existing.id));
  const response = NextResponse.json({ enabled: false }); installationCookie(response, identity); return response;
}
