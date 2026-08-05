import type { Metadata } from "next";
import Link from "next/link";
import { AdminPasswordForm } from "@/components/admin-password-form";

export const metadata: Metadata = { title: "Nastavení administrátorského přístupu", robots: { index: false, follow: false } };
export default function AdminRecoveryPage() { return <main className="admin-login-page"><Link className="admin-back" href="/admin/prihlaseni">← Zpět na přihlášení</Link><AdminPasswordForm /></main>; }
