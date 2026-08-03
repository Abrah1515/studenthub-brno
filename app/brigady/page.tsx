import type { Metadata } from "next";
import { redirect } from "next/navigation";
export const metadata: Metadata = { title: "Brigády", alternates: { canonical: "/brno/brigady" } };
export default function Page() { redirect("/brno/brigady"); }
