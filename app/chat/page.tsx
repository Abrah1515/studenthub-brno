import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatInbox } from "@/components/chat-inbox";

export const metadata: Metadata = { title: "Chat | StudentHub Brno", description: "Soukromé zprávy mezi ověřenými profily StudentHub Brno.", robots: { index: false, follow: false } };
export default function ChatPage() { return <Suspense fallback={<div className="chat-loading">Načítám chat…</div>}><ChatInbox /></Suspense>; }
