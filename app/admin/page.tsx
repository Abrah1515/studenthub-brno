import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getAdminUser } from "@/lib/admin-auth";
export const metadata: Metadata = { title: "Administrace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AdminPage() { const user = await getAdminUser(); if (!user) redirect("/admin/prihlaseni"); return <AdminDashboard adminEmail={user.email} mode={user.mode} role={user.role} />; }
