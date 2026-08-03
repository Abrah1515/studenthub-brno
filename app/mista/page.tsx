import type { Metadata } from "next";
import { redirect } from "next/navigation";
export const metadata: Metadata = { title: "Užitečná místa", alternates: { canonical: "/brno/mista" } };
export default function Page() { redirect("/brno/mista"); }
