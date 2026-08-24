import { NextResponse } from "next/server";
import { listRecords, updateRecord } from "@/lib/data-store";
import { getCurrentAccount } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentAccount(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 }); if (!user.complete || user.accountStatus !== "active") return NextResponse.json({ message: "Profil není připravený pro komunitní akce." }, { status: 403 });
  const id = (await context.params).id; const body = await request.json().catch(() => null) as { status?: string } | null;
  if (!body || !["accepted", "rejected"].includes(body.status || "")) return NextResponse.json({ message: "Neplatné rozhodnutí." }, { status: 422 });
  const join = (await listRecords("buddy_join_requests")).find((row) => String(row.id) === id); if (!join) return NextResponse.json({ message: "Žádost nenalezena." }, { status: 404 });
  const post = (await listRecords("buddy_posts")).find((row) => row.id === join.post_id && row.owner_id === user.id); if (!post) return NextResponse.json({ message: "Tuto žádost nemůžete spravovat." }, { status: 403 });
  if (body.status === "accepted") { const accepted = (await listRecords("buddy_join_requests")).filter((row) => row.post_id === post.id && row.status === "accepted" && row.id !== join.id).length; if (accepted >= Number(post.max_participants) - 1) return NextResponse.json({ message: "Kapacita příspěvku už je naplněná." }, { status: 409 }); }
  await updateRecord("buddy_join_requests", id, { status: body.status }); return NextResponse.json({ message: body.status === "accepted" ? "Účastník byl přijat." : "Žádost byla zamítnuta." });
}
