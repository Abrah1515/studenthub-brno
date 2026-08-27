import { NextResponse } from "next/server";
import { chatError, createAuthenticatedChatClient, getChatConversation, listChatMessages, notifyChatRecipient } from "@/lib/chat-server";
import { chatMessageSchema } from "@/lib/schemas";
import { getCurrentAccount } from "@/lib/user-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getCurrentAccount(); if (!account) return NextResponse.json({ message: "Přihlaste se." }, { status: 401 });
  const { id } = await params;
  try { return NextResponse.json(await listChatMessages(account, id, new URL(request.url).searchParams.get("before")), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { const safe = chatError(error); return NextResponse.json({ message: safe.message }, { status: safe.status }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getCurrentAccount(); if (!account) return NextResponse.json({ message: "Přihlaste se." }, { status: 401 });
  if (!account.complete || account.accountStatus !== "active") return NextResponse.json({ message: "Aktivní dokončený profil je podmínkou chatu." }, { status: 428 });
  const parsed = chatMessageSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zpráva musí mít 1 až 2 000 znaků." }, { status: 422 });
  const { id } = await params;
  try {
    const before = await getChatConversation(account, id); if (!before) return NextResponse.json({ message: "Konverzace nebyla nalezena." }, { status: 404 });
    const client = await createAuthenticatedChatClient(); const result = await client.rpc("send_chat_message", { target_conversation: id, message_body: parsed.data.message, message_nonce: parsed.data.clientNonce }); if (result.error) throw result.error;
    await notifyChatRecipient(id, String(result.data), account.id, false);
    return NextResponse.json({ id: result.data, acceptedRequest: before.status === "requested" && !before.requestedByMe }, { status: 201 });
  } catch (error) { const safe = chatError(error); console.error("chat_message_failed", { userId: account.id, conversationId: id, code: safe.status }); return NextResponse.json({ message: safe.message }, { status: safe.status }); }
}
