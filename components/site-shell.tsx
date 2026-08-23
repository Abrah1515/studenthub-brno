"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, BriefcaseBusiness, CalendarDays, Home, Info, MapPinned, Menu, MessageCircle, Monitor, Moon, Settings, Sun, Users, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { brand } from "@/lib/brand";
import type { City } from "@/lib/cities";
import { classNames } from "@/lib/format";
import type { AcademicCatalog } from "@/lib/types";
import { AcademicCatalogProvider, useAcademicCatalog } from "@/components/academic-catalog-provider";
import { SelectedStudyContext } from "@/components/selected-study-context";
import { calendarPreferenceRequestedEvent, useStudentPreference } from "@/lib/client-preferences";
import { useModalDialog } from "@/lib/use-modal-dialog";
import { PwaInstallButton } from "@/components/pwa-install";
import { openTutorialEvent } from "@/components/feature-tutorial";
import { featureFlags } from "@/lib/feature-flags";
import { WatcherBadge } from "@/components/watcher-badge";

function navigationFor(citySlug: string, cityName: string) {
  const cityBase = `/${citySlug}`;
  return [
    { href: cityBase, label: "Přehled", short: "Přehled", icon: Home },
    { href: `${cityBase}/kalendar`, label: "Kalendář", short: "Termíny", icon: CalendarDays },
    { href: "/hlidac", label: "Hlídač", short: "Hlídač", icon: Bell },
    { href: `${cityBase}/mista`, label: `Místa – ${cityName}`, short: "Místa", icon: MapPinned },
    { href: "/komunita", label: "Studentská komunita", short: "Komunita", icon: MessageCircle },
    { href: "/partak", label: "Hledám parťáka", short: "Parťák", icon: Users },
    { href: `${cityBase}/brigady`, label: "Brigády", short: "Brigády", icon: BriefcaseBusiness },
    ...(featureFlags.offersEnabled ? [{ href: `${cityBase}/nabidky`, label: "Nabídky a slevy", short: "Slevy", icon: CalendarDays }] : []),
    { href: "/pomoc", label: "Technická pomoc", short: "Pomoc", icon: Wrench },
    { href: "/nastaveni", label: "Moje škola", short: "Nastavení", icon: Settings },
  ];
}
type Theme = "system" | "light" | "dark";
const themePreferenceChangedEvent = "studenthub-theme-preference-changed";
function applied(theme: Theme) { return theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme; }
function applyTheme(theme: Theme) { const value = applied(theme); document.documentElement.dataset.theme = value; document.documentElement.dataset.themePreference = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value === "dark" ? brand.colors.darkTheme : brand.colors.lightTheme); }
function useThemePreference() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const stored = localStorage.getItem("studenthub-theme") as Theme | null;
    const initial = stored && ["system", "light", "dark"].includes(stored) ? stored : "system";
    setTheme(initial);
    applyTheme(initial);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => (localStorage.getItem("studenthub-theme") || "system") === "system" && applyTheme("system");
    const syncPreference = (event: Event) => setTheme((event as CustomEvent<Theme>).detail);
    media.addEventListener("change", updateSystemTheme);
    window.addEventListener(themePreferenceChangedEvent, syncPreference);
    return () => { media.removeEventListener("change", updateSystemTheme); window.removeEventListener(themePreferenceChangedEvent, syncPreference); };
  }, []);
  const selectTheme = (value: Theme) => { setTheme(value); localStorage.setItem("studenthub-theme", value); applyTheme(value); window.dispatchEvent(new CustomEvent<Theme>(themePreferenceChangedEvent, { detail: value })); };
  return [theme, selectTheme] as const;
}

function Brand({ href }: { href: string }) { return <Link href={href} className="brand" aria-label={`${brand.editionName} – přehled`}><span className="brand-mark" aria-hidden="true"><Image src={brand.assets.icon192} alt="" width={38} height={38} priority /></span><span><strong>{brand.platformName}</strong><small>{brand.editionShortName}</small></span></Link>; }
function ThemeToggle() {
  const [theme, selectTheme] = useThemePreference();
  const options: Array<{ value: Theme; label: string; icon: typeof Monitor }> = [{ value: "system", label: "Podle zařízení", icon: Monitor }, { value: "light", label: "Světlý režim", icon: Sun }, { value: "dark", label: "Tmavý režim", icon: Moon }];
  return <div className="theme-switcher topbar-theme" role="radiogroup" aria-label="Barevný režim">{options.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="radio" className={theme === value ? "active" : ""} aria-checked={theme === value} aria-label={label} title={label} onClick={() => selectTheme(value)}><Icon size={17} /></button>)}</div>;
}
function ThemeSettings() {
  const [theme, selectTheme] = useThemePreference();
  const options: Array<{ value: Theme; label: string; icon: typeof Monitor }> = [{ value: "system", label: "Podle zařízení", icon: Monitor }, { value: "light", label: "Světlý režim", icon: Sun }, { value: "dark", label: "Tmavý režim", icon: Moon }];
  return <div className="theme-settings" role="radiogroup" aria-label="Nastavení vzhledu">{options.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="radio" data-theme-option={value} className={theme === value ? "active" : ""} aria-checked={theme === value} onClick={() => selectTheme(value)}><Icon size={17} /><span>{label}</span></button>)}</div>;
}

function isActive(pathname: string, href: string, cityRoot: string) { return pathname === href || (href === "/komunita" && pathname.startsWith("/komunita/")) || (href === cityRoot && pathname === "/"); }
function CitySwitcher({ cities, pathname }: { cities: City[]; pathname: string }) { const current = cities.find((city) => pathname === `/${city.slug}` || pathname.startsWith(`/${city.slug}/`)) || cities[0]; return <label className="city-switcher"><span>Město</span><select aria-label="Změnit město" value={current?.slug || ""} onChange={(event) => { const suffix = current && pathname.startsWith(`/${current.slug}`) ? pathname.slice(current.slug.length + 1) : ""; window.location.assign(`/${event.target.value}${suffix}`); }}>{cities.map((city) => <option key={city.id} value={city.slug}>{city.name}</option>)}</select></label>; }

type NavigationItem = ReturnType<typeof navigationFor>[number];
function PreferenceAwareNavLink({ item, pathname, cityRoot, close, compact = false }: { item: NavigationItem; pathname: string; cityRoot: string; close?: () => void; compact?: boolean }) {
  const catalog = useAcademicCatalog();
  const preference = useStudentPreference(catalog);
  const active = isActive(pathname, item.href, cityRoot);
  let href = item.href;
  if (item.href === `${cityRoot}/kalendar` && preference.cityId === cityRoot.slice(1) && (preference.universityId || preference.studyYear)) {
    const query = new URLSearchParams();
    if (preference.universityId) query.set("university", preference.universityId);
    if (preference.facultyId) query.set("faculty", preference.facultyId);
    if (preference.studyYear) query.set("year", String(preference.studyYear));
    href = `${item.href}?${query}`;
  }
  function navigate() {
    close?.();
    if (item.href === `${cityRoot}/kalendar` && preference.cityId === cityRoot.slice(1) && (preference.universityId || preference.studyYear)) {
      window.dispatchEvent(new CustomEvent(calendarPreferenceRequestedEvent, { detail: { universityId: preference.universityId || "", facultyId: preference.facultyId || "", studyYear: preference.studyYear || undefined } }));
    }
  }
  const Icon = item.icon;
  return <Link href={href} onClick={navigate} className={compact ? classNames(active && "active") : classNames("nav-link", active && "nav-link-active")} aria-current={active ? "page" : undefined}><Icon size={compact ? 20 : 19} aria-hidden="true" /><span>{compact ? item.short : item.label}</span>{item.href === "/hlidac" && <WatcherBadge />}</Link>;
}

function MobileMenu({ open, close, navigation, pathname, cityRoot, returnFocus }: { open: boolean; close: () => void; navigation: ReturnType<typeof navigationFor>; pathname: string; cityRoot: string; returnFocus: () => HTMLElement | null }) {
  const ref = useModalDialog<HTMLElement>(open, close);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<div className="mobile-menu-layer" data-modal-layer><button className="mobile-menu-backdrop" data-modal-layer aria-label="Zavřít nabídku" onClick={close} /><aside ref={ref} tabIndex={-1} className="mobile-menu-panel" aria-label="Mobilní nabídka" role="dialog" aria-modal="true" data-modal-layer><div className="sidebar-head"><Brand href={cityRoot} /><button className="icon-button" data-autofocus aria-label="Zavřít nabídku" onClick={close}><X size={20} /></button></div><nav className="desktop-nav tablet-full-nav" aria-label="Hlavní navigace">{navigation.map((item) => <PreferenceAwareNavLink key={item.href} item={item} pathname={pathname} cityRoot={cityRoot} close={close} />)}</nav><nav className="phone-extra-nav" aria-label="Doplňkové funkce"><Link className="nav-link" href="/hlidac" onClick={close}><Bell size={19} />Hlídač<WatcherBadge /></Link><Link className="nav-link" href="/nastaveni" onClick={close}><Settings size={19} />Moje škola</Link><div className="nav-link install-nav-item"><PwaInstallButton onBeforeOpen={close} returnFocus={returnFocus} /></div><button className="nav-link" type="button" onClick={() => { close(); window.dispatchEvent(new Event(openTutorialEvent)); }}><BookOpen size={19} />Návod</button><div className="mobile-theme-block"><strong>Nastavení vzhledu</strong><ThemeSettings /></div><Link className="nav-link" href="/navrhnout-obsah" onClick={close}>Pro spolky</Link><Link className="nav-link" href="/o-projektu" onClick={close}>O projektu</Link><Link className="nav-link" href="/kontakt" onClick={close}>Kontakt</Link><Link className="nav-link" href="/admin" onClick={close}>Administrace</Link></nav><div className="sidebar-note"><Info size={18} /><p>Nezávislý projekt. Není oficiálně spojený s žádnou univerzitou.</p></div><nav className="sidebar-legal tablet-menu-extras" aria-label="Doplňkové odkazy"><Link href="/o-projektu" onClick={close}>O projektu</Link><PwaInstallButton onBeforeOpen={close} returnFocus={returnFocus} /><button type="button" onClick={() => { close(); window.dispatchEvent(new Event(openTutorialEvent)); }}><BookOpen size={15} />Návod</button><Link href="/navrhnout-obsah" onClick={close}>Pro spolky</Link><Link href="/kontakt" onClick={close}>Kontakt</Link><Link href="/admin" onClick={close}>Administrace</Link></nav></aside></div>, document.body);
}

export function SiteShell({ children, cities, catalog }: { children: React.ReactNode; cities: City[]; catalog: AcademicCatalog }) {
  const pathname = usePathname(); const [menuOpen, setMenuOpen] = useState(false); const menuTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const close = () => setMenuOpen(false); window.addEventListener("popstate", close); return () => window.removeEventListener("popstate", close); }, []);
  if (pathname.startsWith("/admin")) return <AcademicCatalogProvider catalog={catalog}>{children}</AcademicCatalogProvider>;
  const currentCity = cities.find((city) => pathname === `/${city.slug}` || pathname.startsWith(`/${city.slug}/`)) || cities[0];
  const citySlug = currentCity?.slug || "brno";
  const cityRoot = `/${citySlug}`;
  const navigation = navigationFor(citySlug, currentCity?.name || "Brně");
  return <AcademicCatalogProvider catalog={catalog}><div className="app-shell">
    <aside className="sidebar desktop-sidebar" aria-label="Postranní panel"><div className="sidebar-head"><div className="brand-context"><Brand href={cityRoot} /><SelectedStudyContext /></div></div><nav className="desktop-nav" aria-label="Hlavní navigace">{navigation.map((item) => <PreferenceAwareNavLink key={item.href} item={item} pathname={pathname} cityRoot={cityRoot} />)}</nav><div className="sidebar-note"><Info size={18} aria-hidden="true" /><p>Nezávislý projekt. Není oficiálně spojený s žádnou univerzitou.</p></div><nav className="sidebar-legal" aria-label="Doplňkové odkazy"><Link href="/o-projektu">O projektu</Link><PwaInstallButton /><button type="button" onClick={() => window.dispatchEvent(new Event(openTutorialEvent))}><BookOpen size={15} />Návod</button><Link href="/navrhnout-obsah">Pro spolky</Link><Link href="/kontakt">Kontakt</Link><Link href="/admin">Administrace</Link></nav></aside>
    <MobileMenu open={menuOpen} close={() => setMenuOpen(false)} navigation={navigation} pathname={pathname} cityRoot={cityRoot} returnFocus={() => menuTriggerRef.current} />
    {cities.length > 1 && <CitySwitcher cities={cities} pathname={pathname} />}
    <div className="main-column"><header className="topbar"><button ref={menuTriggerRef} className="icon-button mobile-only" aria-label="Otevřít nabídku" onClick={() => setMenuOpen(true)}><Menu size={20} /></button><div className="mobile-brand"><Brand href={cityRoot} /></div><div className="topbar-spacer" /><ThemeToggle /><Link href="/pomoc" className="button button-primary topbar-help" aria-label="Technická pomoc"><Wrench size={18} /><span>Technická pomoc</span></Link></header><main id="hlavni-obsah" className="content">{children}</main><footer className="footer"><p>{brand.editionName} · nezávislý studentský projekt</p><div><Link href="/soukromi">Soukromí</Link><Link href="/cookies">Cookies</Link><Link href="/podminky">Podmínky</Link><button type="button" onClick={() => window.dispatchEvent(new Event("open-cookie-settings"))}>Nastavení cookies</button></div></footer></div>
    <nav className="bottom-nav" aria-label="Mobilní navigace">{navigation.filter((item) => [cityRoot, `${cityRoot}/kalendar`, `${cityRoot}/mista`, "/komunita", `${cityRoot}/brigady`].includes(item.href)).map((item) => <PreferenceAwareNavLink key={item.href} item={item} pathname={pathname} cityRoot={cityRoot} compact />)}</nav><Link href="/partak" className="floating-help" title="Hledám parťáka" aria-label="Hledám parťáka"><Users size={22} /><span>Hledám parťáka</span></Link>
  </div></AcademicCatalogProvider>;
}
