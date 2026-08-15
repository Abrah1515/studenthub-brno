import type { Metadata } from "next";
import { CommunityEventManager } from "@/components/community-event-manager";

export const metadata: Metadata = { title: "Správa komunitní akce", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) { return <CommunityEventManager eventId={(await searchParams).id || ""} />; }
