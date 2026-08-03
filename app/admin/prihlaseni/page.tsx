import type { Metadata } from "next";
import Link from "next/link";
import { AdminLoginForm } from "@/components/admin-login-form";
export const metadata: Metadata = { title: "Přihlášení do administrace", robots: { index: false, follow: false } };
export default function AdminLoginPage() { return <main className="admin-login-page"><Link className="admin-back" href="/">← Zpět do aplikace</Link><AdminLoginForm /></main>; }
