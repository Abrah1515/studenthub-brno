import type { Metadata } from "next";
import { redirect } from "next/navigation";
export const metadata: Metadata = { title: "Nabídky a slevy", alternates: { canonical: "/brno/nabidky" } };
export default function Page() { redirect("/brno/nabidky"); }
