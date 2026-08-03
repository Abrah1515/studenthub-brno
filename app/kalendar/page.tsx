import type { Metadata } from "next";
import { redirect } from "next/navigation";
export const metadata: Metadata = { title: "Akademický kalendář", alternates: { canonical: "/brno/kalendar" } };
export default function Page() { redirect("/brno/kalendar"); }
