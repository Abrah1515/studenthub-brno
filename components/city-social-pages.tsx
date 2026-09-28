import { GraduationCap, LockKeyhole } from "lucide-react";
import { AccountProfilePanel } from "@/components/account-profile-panel";
import { BuddyExplorer } from "@/components/buddy-explorer";
import { CommunityFeed } from "@/components/community-feed";
import { OwnerScopeTabs } from "@/components/owner-scope-tabs";
import { PageHeading } from "@/components/page-heading";
import { PreferenceForm, ResetPreferenceButton } from "@/components/preference-picker";
import { WatcherCenter } from "@/components/watcher-center";
import type { City } from "@/lib/cities";
import type { AcademicCatalog } from "@/lib/types";
import { getPlaces } from "@/lib/public-data";

export async function CityCommunityPage({ city }: { city: City }) {
  const places = (await getPlaces(city.id)).map((place) => ({ id: place.id, name: place.name, address: place.address }));
  return <div className="page-stack community-page"><PageHeading eyebrow="Otázky, rady a zkušenosti" title="Studentská komunita" description={`Veřejná diskuse studentů ve městě ${city.name}. Akce s konkrétním datem patří do Co se děje, domluva společné aktivity do Hledám parťáka.`} /><CommunityFeed places={places} /></div>;
}

export function CityBuddyPage({ city, mine = false }: { city: City; mine?: boolean }) {
  return <div className="page-stack"><PageHeading eyebrow="S profilem ihned zveřejněno" title="Hledám parťáka" description="Příspěvek nečeká na předchozí schválení. Komunita jej může nahlásit a opakovaně nahlášený obsah se automaticky skryje ke kontrole. Kontaktní údaje nejsou veřejné." /><OwnerScopeTabs mine={mine} allHref={`/${city.slug}/partak`} mineHref={`/${city.slug}/partak/moje`} /><BuddyExplorer mine={mine} /></div>;
}

export function CityWatcherPage() {
  return <div className="page-stack"><PageHeading eyebrow="Bez registrace na tomto zařízení" title="Hlídač" description="Uložte si termíny a akce, nastavte připomínku a mějte důležité školní změny na jednom místě." /><WatcherCenter /></div>;
}

export function CitySettingsPage({ cities, catalog }: { cities: City[]; catalog: AcademicCatalog }) {
  return <div className="page-stack settings-page"><PageHeading eyebrow="Účet není povinný" title="Moje škola a profil" description="Nejdřív nastavte místní personalizaci. Dobrovolný profil pod ní potřebujete jen pro publikování a komunikaci s ostatními studenty." /><section className="settings-card"><span className="settings-icon"><GraduationCap size={24} /></span><h2>Moje škola</h2><p>Vyberte město, školu, fakultu a případně ročník. Volba okamžitě upraví přehled a zůstane v tomto zařízení i po odhlášení.</p><PreferenceForm cities={cities} catalog={catalog} /></section><section className="settings-privacy"><LockKeyhole size={20} /><div><h2>Žádné školní heslo</h2><p>StudentHub se nepřihlašuje do školních systémů a nečte neveřejná data.</p></div></section><ResetPreferenceButton /><AccountProfilePanel catalog={catalog}/></div>;
}
