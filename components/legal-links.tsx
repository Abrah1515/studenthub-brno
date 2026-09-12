"use client";

import Link from "next/link";
import { classNames } from "@/lib/format";

export function LegalLinks({ className, includeCookieSettings = false }: { className?: string; includeCookieSettings?: boolean }) {
  return <div className={classNames("legal-links", className)} aria-label="Právní informace">
    <Link href="/soukromi">Ochrana osobních údajů</Link>
    <Link href="/cookies">Cookies</Link>
    <Link href="/podminky">Podmínky a pravidla</Link>
    {includeCookieSettings && <button type="button" onClick={() => window.dispatchEvent(new Event("open-cookie-settings"))}>Nastavení cookies</button>}
  </div>;
}

export function CookieSettingsButton({ className }: { className?: string }) {
  return <button className={className} type="button" onClick={() => window.dispatchEvent(new Event("open-cookie-settings"))}>Nastavení cookies</button>;
}

export function LegalNotice({ account = false, privacyOnly = false }: { account?: boolean; privacyOnly?: boolean }) {
  return <p className="legal-notice">
    {account ? "Registrací potvrzujete, že je vám alespoň 15 let a že jste se seznámili s " : privacyOnly ? "Odesláním předáte údaje podle " : "Zveřejněním obsahu potvrzujete soulad s "}
    {privacyOnly ? <Link href="/soukromi">ochranou osobních údajů</Link> : <><Link href="/podminky">Podmínkami a pravidly</Link> a <Link href="/soukromi">ochranou osobních údajů</Link></>}.
  </p>;
}
