import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { UserLoginForm } from "@/components/user-login-form";
export const metadata: Metadata = { title: "Přihlášení studenta", robots: { index: false, follow: false } };
export default function UserLoginPage() { return <div className="page-stack auth-page"><PageHeading eyebrow="Supabase Auth" title="Ověření studentského účtu" description="StudentHub nevyžaduje školní heslo. Stačí ověřit vlastní e-mail pomocí jednorázového odkazu." /><UserLoginForm /></div>; }
