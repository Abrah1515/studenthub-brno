import { NextResponse } from "next/server";
import { ownerCookieName, ownerCookieOptions, ownerIdentity } from "@/lib/anonymous-owner";
import { insertRecord, listRecords } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { reportSchema } from "@/lib/schemas";
import { getCurrentUser } from "@/lib/user-auth";

export async function POST(request: Request) {
  if (!allowRequest(`report:${requestFingerprint(request)}`, 5, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit hlášení byl vyčerpán." }, { status: 429 });
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Neplatné hlášení." }, { status: 422 });
  const table = parsed.data.targetType === "service_request" ? "service_requests" : "buddy_posts";
  if (!(await listRecords(table)).some((row) => String(row.id) === parsed.data.targetId)) return NextResponse.json({ message: "Obsah nebyl nalezen." }, { status: 404 });
  const owner = ownerIdentity(request);
  const user = await getCurrentUser();
  try { await insertRecord("content_reports", { target_type: parsed.data.targetType, target_id: parsed.data.targetId, reporter_id: user?.id || null, reporter_session_hash: user ? null : owner.hash, reason: parsed.data.reason, detail: parsed.data.detail, status: "new", city_id: parsed.data.cityId || "brno" }); }
  catch (error) { if (typeof error === "object" && error && "code" in error && error.code === "23505") return NextResponse.json({ message: "Tento obsah jste už nahlásili." }, { status: 409 }); throw error; }
  const response = NextResponse.json({ message: "Hlášení jsme přijali k posouzení." }, { status: 201 });
  if (owner.isNew) response.cookies.set(ownerCookieName, owner.token, ownerCookieOptions);
  return response;
}
