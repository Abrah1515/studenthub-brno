import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function MarketplaceVerificationPage({ params }: { params: Promise<{ city: string }> }) { redirect(`/${encodeURIComponent((await params).city)}/burza`); }
