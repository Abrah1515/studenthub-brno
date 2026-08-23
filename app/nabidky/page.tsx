import type { Metadata } from "next";
import { redirect } from "next/navigation";
export const metadata: Metadata = { title: "Nabídky a slevy", alternates: { canonical: "/brno/nabidky" }, robots: { index: false, follow: false } };
export default function Page() { redirect("/brno/nabidky"); }
