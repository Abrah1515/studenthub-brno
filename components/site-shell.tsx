"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, BriefcaseBusiness, Building2, CalendarDays, Home, Info, MapPinned, Menu, MessageCircle, Monitor, Moon, Settings, ShoppingBag, Sun, Users, X } from "lucide-react";
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
import { openTutorialEvent, tutorialMenuEvent, tutorialResetUiEvent } from "@/lib/tutorial";
import { featureFlags } from "@/lib/feature-flags";
import { WatcherBadge } from "@/components/watcher-badge";
import { ChatBadge } from "@/components/chat-badge";
import { ChatDock } from "@/components/chat-dock";
import { BrandHorizontalLogo, BrandSymbol } from "@/components/brand-logo";

function navigationFor(citySlug: string, cityName: string) {
  const cityBase = `/${citySlug}`;
  return [
    { href: cityBase, label: "Přehled", short: "Přehled", icon: Home, tourId: "overview-navigation" },
    { href: `${cityBase}/kalendar`, label: "Kalendář", short: "Termíny", icon: CalendarDays, tourId: "calendar-navigation" },
    { href: `${cityBase}/hlidac`, label: "Hlídač", short: "Hlídač", icon: Bell, tourId: "watcher-navigation" },
    { href: `${cityBase}/chat`, label: "Chat", short: "Chat", icon: MessageCircle, tourId: "chat-navigation" },
    { href: `${cityBase}/mista`, label: `Místa – ${cityName}`, short: "Místa", icon: MapPinned, tourId: "places-navigation" },
    { href: `${cityBase}/komunita`, label: "Studentská komunita", short: "Komunita", icon: MessageCircle, tourId: "community-navigation" },
    { href: `${cityBase}/partak`, label: "Hledám parťáka", short: "Parťák", icon: Users, tourId: "buddy-navigation" },
    { href: `${cityBase}/brigady`, label: "Brigády", short: "Brigády", icon: BriefcaseBusiness, tourId: "jobs-navigation" },
    ...(featureFlags.offersEnabled ? [{ href: `${cityBase}/nabidky`, label: "Nabídky a slevy", short: "Slevy", icon: CalendarDays, tourId: "offers-navigation" }] : []),
    { href: `${cityBase}/burza`, label: "Studentská burza", short: "Burza", icon: ShoppingBag, tourId: "marketplace-navigation" },
    ...(citySlug === "brno" ? [{ href: `${cityBase}/bydleni`, label: "Bydlení", short: "Bydlení", icon: Building2, tourId: "housing-navigation" }] : []),
    { href: `${cityBase}/nastaveni`, label: "Moje škola a profil", short: "Profil", icon: Settings, tourId: "settings-navigation" },
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

function Brand({ href, compact = false, tourId }: { href: string; compact?: boolean; tourId?: string }) { return <Link href={href} className="brand" aria-label={`${brand.editionName} – přehled`} data-tour-id={tourId}>{compact ? <BrandSymbol priority /> : <BrandHorizontalLogo priority />}</Link>; }
function ThemeToggle() {
  const [theme, selectTheme] = useThemePreference();
  const options: Array<{ value: Theme; label: string; icon: typeof Monitor }> = [{ value: "system", label: "Podle zařízení", icon: Monitor }, { value: "light", label: "Světlý režim", icon: Sun }, { value: "dark", label: "Tmavý režim", icon: Moon }];
  return <div className="theme-switcher topbar-theme" role="radiogroup" aria-label="Barevný režim" data-tour-id="appearance-navigation-topbar">{options.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="radio" className={theme === value ? "active" : ""} aria-checked={theme === value} aria-label={label} title={label} onClick={() => selectTheme(value)}><Icon size={17} /></button>)}</div>;
}
function ThemeSettings() {
  const [theme, selectTheme] = useThemePreference();
  const options: Array<{ value: Theme; label: string; icon: typeof Monitor }> = [{ value: "system", label: "Podle zařízení", icon: Monitor }, { value: "light", label: "Světlý režim", icon: Sun }, { value: "dark", label: "Tmavý režim", icon: Moon }];
  return <div className="theme-settings" role="radiogroup" aria-label="Nastavení vzhledu">{options.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="radio" data-theme-option={value} className={theme === value ? "active" : ""} aria-checked={theme === value} onClick={() => selectTheme(value)}><Icon size={17} /><span>{label}</span></button>)}</div>;
}

function isActive(pathname: string, href: string) {
  const cityPrefix = href.match(/^\/[a-z0-9-]+/)?.[0] || "";
  const effectivePathname = cityPrefix && !pathname.startsWith(`${cityPrefix}/`) && pathname !== cityPrefix ? `${cityPrefix}${pathname}` : pathname;
  return effectivePathname === href || (["/komunita", "/chat", "/profil"].some((suffix) => href.endsWith(suffix)) && effectivePathname.startsWith(`${href}/`));
}
function CitySwitcher({ cities, pathname }: { cities: City[]; pathname: string }) { const current = cities.find((city) => pathname === `/${city.slug}` || pathname.startsWith(`/${city.slug}/`)) || cities[0]; return <label className="city-switcher"><span>Město</span><select aria-label="Změnit město" value={current?.slug || ""} onChange={(event) => { const suffix = current && pathname.startsWith(`/${current.slug}`) ? pathname.slice(current.slug.length + 1) : ""; window.location.assign(`/${event.target.value}${suffix}`); }}>{cities.map((city) => <option key={city.id} value={city.slug}>{city.name}</option>)}</select></label>; }

type NavigationItem = ReturnType<typeof navigationFor>[number];
function PreferenceAwareNavLink({ item, pathname, cityRoot, close, compact = false, tourVariant }: { item: NavigationItem; pathname: string; cityRoot: string; close?: () => void; compact?: boolean; tourVariant?: "desktop" | "menu" | "bottom" }) {
  const catalog = useAcademicCatalog();
  const preference = useStudentPreference(catalog);
  const active = isActive(pathname, item.href);
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
  return <Link href={href} onClick={navigate} className={compact ? classNames(active && "active") : classNames("nav-link", active && "nav-link-active")} aria-current={active ? "page" : undefined} data-tour-id={tourVariant ? `${item.tourId}-${tourVariant}` : undefined}><Icon size={compact ? 20 : 19} aria-hidden="true" /><span>{compact ? item.short : item.label}</span>{item.href.endsWith("/hlidac") && <WatcherBadge />}{item.href.endsWith("/chat") && <ChatBadge compact={compact} />}</Link>;
}

function MobileMenu({ open, close, navigation, pathname, cityRoot, returnFocus, tourMode }: { open: boolean; close: () => void; navigation: ReturnType<typeof navigationFor>; pathname: string; cityRoot: string; returnFocus: () => HTMLElement | null; tourMode: boolean }) {
  const ref = useModalDialog<HTMLElement>(open && !tourMode, close);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<div className={classNames("mobile-menu-layer", tourMode && "tutorial-menu-open")} data-modal-layer><button className="mobile-menu-backdrop" data-modal-layer aria-label="Zavřít nabídku" onClick={close} tabIndex={tourMode ? -1 : undefined} /><aside ref={ref} tabIndex={-1} className="mobile-menu-panel" aria-label="Mobilní nabídka" aria-hidden={tourMode || undefined} inert={tourMode || undefined} role={tourMode ? undefined : "dialog"} aria-modal={tourMode ? undefined : true} data-modal-layer><div className="sidebar-head"><Brand href={cityRoot} /><button className="icon-button" data-autofocus={!tourMode || undefined} aria-label="Zavřít nabídku" onClick={close} tabIndex={tourMode ? -1 : undefined}><X size={20} /></button></div><nav className="desktop-nav tablet-full-nav" aria-label="Hlavní navigace">{navigation.map((item) => <PreferenceAwareNavLink key={item.href} item={item} pathname={pathname} cityRoot={cityRoot} close={close} tourVariant="menu" />)}</nav><nav className="phone-extra-nav" aria-label="Doplňkové funkce"><Link className="nav-link" href={`${cityRoot}/chat`} onClick={close} data-tour-id="chat-navigation-menu"><MessageCircle size={19} />Chat<ChatBadge /></Link><Link className="nav-link" href={`${cityRoot}/bydleni`} onClick={close} data-tour-id="housing-navigation-menu"><Building2 size={19} />Bydlení</Link><Link className="nav-link" href={`${cityRoot}/hlidac`} onClick={close} data-tour-id="watcher-navigation-menu"><Bell size={19} />Hlídač<WatcherBadge /></Link><Link className="nav-link" href={`${cityRoot}/nastaveni`} onClick={close} data-tour-id="settings-navigation-menu"><Settings size={19} />Moje škola a profil</Link><Link className="nav-link" href="/" onClick={close} data-tour-id="change-city-navigation-menu"><MapPinned size={19} />Změnit město</Link><div className="nav-link install-nav-item"><PwaInstallButton onBeforeOpen={close} returnFocus={returnFocus} tourId="install-navigation-menu" /></div><button className="nav-link" type="button" onClick={() => { close(); window.dispatchEvent(new Event(openTutorialEvent)); }}><BookOpen size={19} />Návod</button><div className="mobile-theme-block" data-tour-id="appearance-navigation-menu"><strong>Nastavení vzhledu</strong><ThemeSettings /></div><Link className="nav-link" href="/o-projektu" onClick={close} data-tour-id="about-navigation-menu">O projektu</Link><Link className="nav-link" href="/kontakt" onClick={close} data-tour-id="contact-navigation-menu">Kontakt</Link><Link className="nav-link" href="/admin" onClick={close} data-tour-id="admin-navigation-menu">Administrace</Link></nav><div className="sidebar-note"><Info size={18} /><p>Nezávislý projekt. Není oficiálně spojený s žádnou univerzitou.</p></div><nav className="sidebar-legal tablet-menu-extras" aria-label="Doplňkové odkazy"><Link href="/" onClick={close} data-tour-id="change-city-navigation-tablet"><MapPinned size={15} />Změnit město</Link><Link href="/o-projektu" onClick={close} data-tour-id="about-navigation-tablet">O projektu</Link><PwaInstallButton onBeforeOpen={close} returnFocus={returnFocus} tourId="install-navigation-tablet" /><button type="button" onClick={() => { close(); window.dispatchEvent(new Event(openTutorialEvent)); }}><BookOpen size={15} />Návod</button><Link href="/kontakt" onClick={close} data-tour-id="contact-navigation-tablet">Kontakt</Link><Link href="/admin" onClick={close} data-tour-id="admin-navigation-tablet">Administrace</Link></nav></aside></div>, document.body);
}

export function SiteShell({ children, cities, catalog }: { children: React.ReactNode; cities: City[]; catalog: AcademicCatalog }) {
  const pathname = usePathname(); const [menuOpen, setMenuOpen] = useState(false); const [tourMenuOpen, setTourMenuOpen] = useState(false); const menuTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const close = () => setMenuOpen(false); window.addEventListener("popstate", close); return () => window.removeEventListener("popstate", close); }, []);
  useEffect(() => { const update = (event: Event) => setTourMenuOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open)); window.addEventListener(tutorialMenuEvent, update); return () => window.removeEventListener(tutorialMenuEvent, update); }, []);
  useEffect(() => { const reset = () => { setMenuOpen(false); setTourMenuOpen(false); }; window.addEventListener(tutorialResetUiEvent, reset); return () => window.removeEventListener(tutorialResetUiEvent, reset); }, []);
  if (pathname.startsWith("/admin")) return <AcademicCatalogProvider catalog={catalog}>{children}</AcademicCatalogProvider>;
  if (pathname === "/") return <AcademicCatalogProvider catalog={catalog}>{children}</AcademicCatalogProvider>;
  const currentCity = cities.find((city) => pathname === `/${city.slug}` || pathname.startsWith(`/${city.slug}/`)) || cities[0];
  const citySlug = currentCity?.slug || "brno";
  const cityRoot = `/${citySlug}`;
  const navigation = navigationFor(citySlug, currentCity?.name || "Brně");
  const chatConversationOpen = new RegExp(`^${cityRoot}/chat/[^/]+`).test(pathname);
  return <AcademicCatalogProvider catalog={catalog}><div className={classNames("app-shell", chatConversationOpen && "chat-route-active")}>
    <aside className="sidebar desktop-sidebar" aria-label="Postranní panel"><div className="sidebar-head"><div className="brand-context"><Brand href={cityRoot} tourId="brand-desktop" /><SelectedStudyContext /></div></div><nav className="desktop-nav" aria-label="Hlavní navigace">{navigation.map((item) => <PreferenceAwareNavLink key={item.href} item={item} pathname={pathname} cityRoot={cityRoot} tourVariant="desktop" />)}</nav><div className="sidebar-note"><Info size={18} aria-hidden="true" /><p>Nezávislý projekt. Není oficiálně spojený s žádnou univerzitou.</p></div><nav className="sidebar-legal" aria-label="Doplňkové odkazy"><Link href="/" data-tour-id="change-city-navigation-desktop"><MapPinned size={15} />Změnit město</Link><Link href="/o-projektu" data-tour-id="about-navigation-desktop">O projektu</Link><PwaInstallButton tourId="install-navigation-desktop" /><button type="button" onClick={() => window.dispatchEvent(new Event(openTutorialEvent))}><BookOpen size={15} />Návod</button><Link href="/kontakt" data-tour-id="contact-navigation-desktop">Kontakt</Link><Link href="/admin" data-tour-id="admin-navigation-desktop">Administrace</Link></nav></aside>
    <MobileMenu open={menuOpen || tourMenuOpen} close={() => { setMenuOpen(false); setTourMenuOpen(false); }} navigation={navigation} pathname={pathname} cityRoot={cityRoot} returnFocus={() => menuTriggerRef.current} tourMode={tourMenuOpen && !menuOpen} />
    {cities.length > 1 && <CitySwitcher cities={cities} pathname={pathname} />}
    <div className="main-column"><header className="topbar"><button ref={menuTriggerRef} className="icon-button mobile-only" aria-label="Otevřít nabídku" data-tour-id="menu-trigger" onClick={() => setMenuOpen(true)}><Menu size={20} /></button><div className="mobile-brand"><Brand href={cityRoot} compact tourId="brand-compact" /></div><div className="topbar-spacer" /><Link href={`${cityRoot}/chat`} className="icon-button mobile-chat-link" aria-label="Otevřít chat" data-tour-id="chat-navigation-compact"><MessageCircle size={20} /><ChatBadge compact /></Link><ThemeToggle /><Link href={`${cityRoot}/burza`} className="button button-primary topbar-help" aria-label="Studentská burza" data-tour-id="marketplace-navigation-topbar"><ShoppingBag size={18} /><span>Burza</span></Link></header><main id="hlavni-obsah" className="content">{children}</main><footer className="footer"><p><BrandSymbol size={22} />{brand.editionName} · nezávislý studentský projekt</p><div><Link href="/soukromi">Soukromí</Link><Link href="/cookies">Cookies</Link><Link href="/podminky">Podmínky</Link><button type="button" onClick={() => window.dispatchEvent(new Event("open-cookie-settings"))}>Nastavení cookies</button></div></footer></div>
    <nav className="bottom-nav" aria-label="Mobilní navigace">{navigation.filter((item) => [cityRoot, `${cityRoot}/kalendar`, `${cityRoot}/mista`, `${cityRoot}/komunita`, `${cityRoot}/brigady`].includes(item.href)).map((item) => <PreferenceAwareNavLink key={item.href} item={item} pathname={pathname} cityRoot={cityRoot} compact tourVariant="bottom" />)}</nav><Link href={`${cityRoot}/partak`} className="floating-help" title="Hledám parťáka" aria-label="Hledám parťáka" data-tour-id="buddy-navigation-floating"><Users size={22} /><span>Hledám parťáka</span></Link>{!pathname.startsWith(`${cityRoot}/chat`) && <ChatDock />}
  </div></AcademicCatalogProvider>;
}
