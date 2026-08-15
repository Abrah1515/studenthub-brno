import type { Metadata } from "next";
import { redirect } from "next/navigation";
export const metadata: Metadata = { title: "Kalendář a Co se děje", alternates: { canonical: "/brno/kalendar" } };
export default function Page() { redirect("/brno/kalendar"); }
