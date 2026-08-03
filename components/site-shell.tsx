"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, CalendarDays, Handshake, HeartHandshake, Home, Info, MapPinned, Menu, Monitor, Moon, Settings, Sun, Wrench, X } from "lucide-react";
import { useEffect, useState } from "react";
import { brand } from "@/lib/brand";
import type { City } from "@/lib/cities";
import { classNames } from "@/lib/format";
import type { AcademicCatalog } from "@/lib/types";
import { AcademicCatalogProvider } from "@/components/academic-catalog-provider";
import { SelectedStudyContext } from "@/components/selected-study-context";
import { useModalDialog } from "@/lib/use-modal-dialog";

function navigationFor(citySlug: string, cityName: string) {
  const cityBase = `/${citySlug}`;
  return [
    { href: cityBase, label: "Přehled", short: "Přehled", icon: Home },
    { href: `${cityBase}/kalendar`, label: "Kalendář", short: "Termíny", icon: CalendarDays },
    { href: `${cityBase}/mista`, label: `Místa – ${cityName}`, short: "Místa", icon: MapPinned },
    { href: `${cityBase}/nabidky`, label: "Nabídky a slevy", short: "Slevy", icon: Handshake },
    { href: `${cityBase}/brigady`, label: "Brigády", short: "Brigády", icon: BriefcaseBusiness },
    { href: "/pomoc", label: "Technická pomoc", short: "Pomoc", icon: Wrench },
    { href: "/nastaveni", label: "Moje škola", short: "Nastavení", icon: Settings },
  ];
}
type Theme = "system" | "light" | "dark";
function applied(theme: Theme) { return theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme; }
function applyTheme(theme: Theme) { const value = applied(theme); document.documentElement.dataset.theme = value; document.documentElement.dataset.themePreference = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value === "dark" ? brand.colors.darkTheme : brand.colors.lightTheme); }

function Brand({ href }: { href: string }) { return <Link href={href} className="brand" aria-label={`${brand.editionName} – přehled`}><span className="brand-mark" aria-hidden="true"><Image src={brand.assets.icon192} alt="" width={38} height={38} priority /></span><span><strong>{brand.platformName}</strong><small>{brand.editionShortName}</small></span></Link>; }
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => { const stored = localStorage.getItem("studenthub-theme") as Theme | null; const initial = stored && ["system", "light", "dark"].includes(stored) ? stored : "system"; setTheme(initial); applyTheme(initial); const media = matchMedia("(prefers-color-scheme: dark)"); const update = () => initial === "system" && applyTheme("system"); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const options: Array<{ value: Theme; label: string; icon: typeof Monitor }> = [{ value: "system", label: "Podle zařízení", icon: Monitor }, { value: "light", label: "Světlý režim", icon: Sun }, { value: "dark", label: "Tmavý režim", icon: Moon }];
  return <div className="theme-switcher" role="group" aria-label="Barevný režim">{options.map(({ value, label, icon: Icon }) => <button key={value} type="button" className={theme === value ? "active" : ""} aria-pressed={theme === value} aria-label={label} title={label} onClick={() => { setTheme(value); localStorage.setItem("studenthub-theme", value); applyTheme(value); }}><Icon size={17} /></button>)}</div>;
}

function isActive(pathname: string, href: string, cityRoot: string) { return pathname === href || (href === cityRoot && pathname === "/"); }
function CitySwitcher({ cities, pathname }: { cities: City[]; pathname: string }) { const current = cities.find((city) => pathname === `/${city.slug}` || pathname.startsWith(`/${city.slug}/`)) || cities[0]; return <label className="city-switcher"><span>Město</span><select aria-label="Změnit město" value={current?.slug || ""} onChange={(event) => { const suffix = current && pathname.startsWith(`/${current.slug}`) ? pathname.slice(current.slug.length + 1) : ""; window.location.assign(`/${event.target.value}${suffix}`); }}>{cities.map((city) => <option key={city.id} value={city.slug}>{city.name}</option>)}</select></label>; }

export function SiteShell({ children, cities, catalog }: { children: React.ReactNode; cities: City[]; catalog: AcademicCatalog }) {
  const pathname = usePathname(); const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useModalDialog<HTMLElement>(menuOpen, () => setMenuOpen(false));
  if (pathname.startsWith("/admin")) return <AcademicCatalogProvider catalog={catalog}>{children}</AcademicCatalogProvider>;
  const currentCity = cities.find((city) => pathname === `/${city.slug}` || pathname.startsWith(`/${city.slug}/`)) || cities[0];
  const citySlug = currentCity?.slug || "brno";
  const cityRoot = `/${citySlug}`;
  const navigation = navigationFor(citySlug, currentCity?.name || "Brně");
  return <AcademicCatalogProvider catalog={catalog}><div className="app-shell">
    <aside ref={menuRef} tabIndex={menuOpen ? -1 : undefined} className={classNames("sidebar", menuOpen && "sidebar-open")} aria-label="Postranní panel" role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen || undefined} data-modal-layer={menuOpen || undefined}><div className="sidebar-head"><div className="brand-context"><Brand href={cityRoot} /><SelectedStudyContext /></div><button className="icon-button mobile-only" data-autofocus={menuOpen || undefined} aria-label="Zavřít nabídku" onClick={() => setMenuOpen(false)}><X size={20} /></button></div><nav className="desktop-nav" aria-label="Hlavní navigace">{navigation.map(({ href, label, icon: Icon }) => { const active = isActive(pathname, href, cityRoot); return <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={classNames("nav-link", active && "nav-link-active")} aria-current={active ? "page" : undefined}><Icon size={19} aria-hidden="true" /><span>{label}</span></Link>; })}</nav><div className="sidebar-note"><Info size={18} aria-hidden="true" /><p>Nezávislý projekt. Není oficiálně spojený s žádnou univerzitou.</p></div><nav className="sidebar-legal" aria-label="Doplňkové odkazy"><Link href="/o-projektu">O projektu</Link><Link href="/navrhnout-obsah">Pro spolky</Link><Link href="/kontakt">Kontakt</Link><Link href="/admin">Administrace</Link></nav></aside>
    {cities.length > 1 && <CitySwitcher cities={cities} pathname={pathname} />}
    {menuOpen && <button className="backdrop" data-modal-layer aria-label="Zavřít nabídku" onClick={() => setMenuOpen(false)} />}
    <div className="main-column"><header className="topbar"><button className="icon-button mobile-only" aria-label="Otevřít nabídku" onClick={() => setMenuOpen(true)}><Menu size={20} /></button><div className="mobile-brand"><Brand href={cityRoot} /></div><div className="topbar-spacer" /><ThemeToggle /></header><main id="hlavni-obsah" className="content">{children}</main><footer className="footer"><p>{brand.editionName} · nezávislý studentský projekt</p><div><Link href="/soukromi">Soukromí</Link><Link href="/cookies">Cookies</Link><Link href="/podminky">Podmínky</Link><button type="button" onClick={() => window.dispatchEvent(new Event("open-cookie-settings"))}>Nastavení cookies</button></div></footer></div>
    <nav className="bottom-nav" aria-label="Mobilní navigace">{navigation.slice(0, 5).map(({ href, short, icon: Icon }) => { const active = isActive(pathname, href, cityRoot); return <Link key={href} href={href} className={classNames(active && "active")} aria-current={active ? "page" : undefined}><Icon size={20} aria-hidden="true" /><span>{short}</span></Link>; })}</nav><Link href="/pomoc" className="floating-help" aria-label="Potřebuji technickou pomoc"><HeartHandshake size={22} /><span>Technická pomoc</span></Link>
  </div></AcademicCatalogProvider>;
}
