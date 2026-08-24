import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export const metadata: Metadata = { title: "Kontakt", robots: { index: false, follow: false } };
export default function RetiredContentSubmissionPage() { permanentRedirect("/kontakt"); }
