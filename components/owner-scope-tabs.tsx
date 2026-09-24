"use client";

import Link from "next/link";

type Props = { mine: boolean; onChange?: (mine: boolean) => void; allHref?: string; mineHref?: string };

export function OwnerScopeTabs({ mine, onChange, allHref, mineHref }: Props) {
  const item = (active: boolean, label: string, href?: string, value?: boolean) => href
    ? <Link href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{label}</Link>
    : <button type="button" className={active ? "active" : ""} aria-pressed={active} onClick={() => onChange?.(Boolean(value))}>{label}</button>;
  return <nav className="owner-scope-tabs" aria-label="Rozsah obsahu">
    {item(!mine, "Vše", allHref, false)}
    {item(mine, "Moje", mineHref, true)}
  </nav>;
}
