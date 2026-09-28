import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatThread } from "@/components/chat-thread";
import { getPublishedCityModule } from "@/lib/city-data";

export const metadata: Metadata = { title: "Konverzace", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ city: string; id: string }> }) { const { city: slug, id } = await params; if (!await getPublishedCityModule(slug, "chat")) notFound(); return <div className="chat-conversation-page"><ChatThread conversationId={id} /></div>; }
