import type { Metadata } from "next";
import { CityDashboard } from "@/components/city-dashboard-page";
import { brnoCity } from "@/lib/cities";
export const metadata: Metadata = { title: "Přehled", description: "Nejbližší ověřené termíny, místa, nabídky a brigády pro studenty v Brně.", alternates: { canonical: "/brno" } };
export const dynamic = "force-dynamic";
export default function DashboardPage() { return <CityDashboard city={brnoCity} />; }
