import { NextResponse } from "next/server";
import { deleteRecord, listRecords, updateRecord } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { buddyPostUpdateSchema } from "@/lib/schemas";
import { getCurrentAccount } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };
async function ownedPost(id: string, ownerId: string) { return (await listRecords("buddy_posts")).find((row) => String(row.id) === id && row.owner_id === ownerId); }

export async function PATCH(request: Request, context: Context) {
  if (!allowRequest(`buddy-edit:${requestFingerprint(request)}`, 20, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit úprav byl vyčerpán." }, { status: 429 });
  const user = await getCurrentAccount(); if (!user?.complete) return NextResponse.json({ message: "Přihlaste se a dokončete profil." }, { status: 401 });
  const id = (await context.params).id; const post = await ownedPost(id, user.id); if (!post) return NextResponse.json({ message: "Příspěvek nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const parsed = buddyPostUpdateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte změny.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const value = parsed.data; const startsAt = value.startsAt ? new Date(value.startsAt) : null;
  const saved = await updateRecord("buddy_posts", id, { ...(value.approximateLocation ? { approximate_location: value.approximateLocation } : {}), ...(value.description ? { description: value.description } : {}), ...(value.maxParticipants ? { max_participants: value.maxParticipants } : {}), ...(value.status ? { status: value.status } : {}), ...(startsAt ? { starts_at: startsAt.toISOString(), expires_at: new Date(startsAt.getTime() + 12 * 60 * 60 * 1000).toISOString() } : {}) });
  return NextResponse.json({ item: saved, message: value.status === "closed" ? "Příspěvek byl uzavřen." : "Příspěvek byl upraven." });
}

export async function DELETE(request: Request, context: Context) {
  if (!allowRequest(`buddy-delete:${requestFingerprint(request)}`, 10, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit operací byl vyčerpán." }, { status: 429 });
  const user = await getCurrentAccount(); if (!user?.complete) return NextResponse.json({ message: "Přihlaste se a dokončete profil." }, { status: 401 });
  const id = (await context.params).id; if (!await ownedPost(id, user.id)) return NextResponse.json({ message: "Příspěvek nebyl nalezen nebo vám nepatří." }, { status: 404 });
  await deleteRecord("buddy_posts", id); return new NextResponse(null, { status: 204 });
}
