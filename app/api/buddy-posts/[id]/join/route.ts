import { NextResponse } from "next/server";
import { insertRecord, listRecords } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { buddyJoinSchema } from "@/lib/schemas";
import { getCurrentAccount } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  if (!allowRequest(`buddy-join:${requestFingerprint(request)}`, 15, 24 * 60 * 60 * 1000)) return NextResponse.json({ message: "Denní limit žádostí byl vyčerpán." }, { status: 429 });
  const user = await getCurrentAccount(); if (!user) return NextResponse.json({ message: "Přihlaste se." }, { status: 401 }); if(user.accountStatus!=="active")return NextResponse.json({message:"Váš účet má pozastavené komunitní funkce."},{status:403}); if(!user.complete)return NextResponse.json({message:"Nejdřív dokončete veřejný profil.",profileRequired:true},{status:428});
  const parsed = buddyJoinSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Neplatná zpráva." }, { status: 422 });
  const id = (await context.params).id; const post = (await listRecords("buddy_posts")).find((row) => String(row.id) === id && row.moderation_status === "approved" && row.status === "active");
  if (!post || new Date(String(post.expires_at)).getTime() < Date.now()) return NextResponse.json({ message: "Příspěvek už není aktivní." }, { status: 404 });
  if (post.owner_id === user.id) return NextResponse.json({ message: "K vlastnímu příspěvku se nelze připojit." }, { status: 409 });
  if ((await listRecords("buddy_join_requests")).some((row) => row.post_id === id && row.requester_id === user.id)) return NextResponse.json({ message: "Žádost už byla odeslána." }, { status: 409 });
  await insertRecord("buddy_join_requests", { post_id: id, requester_id: user.id, message: parsed.data.message, status: "pending" });
  return NextResponse.json({ message: "Žádost o připojení byla odeslána." }, { status: 201 });
}
