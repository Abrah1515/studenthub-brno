import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getAdminUser } from "@/lib/admin-auth";
import { adminSectionAllowed, defaultAdminSection, isAdminSection } from "@/lib/admin-sections";
export const metadata: Metadata = { title: "Administrace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) { const user = await getAdminUser(); if (!user) redirect("/admin/prihlaseni"); const requested = (await searchParams).section; if (requested && (!isAdminSection(requested) || !adminSectionAllowed(requested, user.role))) notFound(); return <AdminDashboard adminEmail={user.email} mode={user.mode} role={user.role} initialSection={requested && isAdminSection(requested) ? requested : defaultAdminSection(user.role)} />; }
