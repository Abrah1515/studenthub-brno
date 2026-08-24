import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { UserLoginForm } from "@/components/user-login-form";
export const metadata: Metadata = { title: "Přihlášení studenta", robots: { index: false, follow: false } };
export default async function UserLoginPage({searchParams}:{searchParams:Promise<{next?:string}>}) { const next=(await searchParams).next; return <div className="page-stack auth-page"><PageHeading eyebrow="Dobrovolný účet" title="Přihlášení a registrace" description="Prohlížení StudentHubu zůstává bez účtu. Profil je potřeba jen pro veřejné publikování, reakce a kontaktování dalších studentů." /><UserLoginForm next={next}/></div>; }
