import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChatInbox } from "@/components/chat-inbox";
import { getPublishedCityModule } from "@/lib/city-data";

export const metadata: Metadata = { title: "Chat", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ city: string }> }) { const city = await getPublishedCityModule((await params).city, "chat"); if (!city) notFound(); return <Suspense fallback={<div className="chat-loading">Načítám chat…</div>}><ChatInbox /></Suspense>; }
