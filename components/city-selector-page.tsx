import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, MapPinned } from "lucide-react";
import { cityEditions, type CityEdition } from "@/lib/city-editions";
import { LegalLinks } from "@/components/legal-links";

function CityLogo({ city }: { city: CityEdition }) {
  return <span className="city-selection-logo" role="img" aria-label={`Logo StudentHub ${city.name}`} style={{ aspectRatio: `${city.logoWidth} / ${city.logoHeight}` }}>
    <Image className="city-selection-logo-light" src={city.logo} alt="" fill sizes="(max-width: 560px) 70vw, (max-width: 1024px) 32vw, 19vw" priority={city.slug === "brno"} />
    <Image className="city-selection-logo-dark" src={city.logoDark} alt="" fill sizes="(max-width: 560px) 70vw, (max-width: 1024px) 32vw, 19vw" priority={city.slug === "brno"} />
  </span>;
}

function ActiveCity({ city }: { city: CityEdition & { href: `/${string}` } }) {
  return <Link className="city-selection-card city-selection-card-active" href={city.href} aria-label={`Otevřít StudentHub ${city.name}`}>
    <span className="city-selection-status city-selection-status-active"><CheckCircle2 size={15} />{city.statusLabel}</span>
    <CityLogo city={city} />
    <span className="city-selection-action">Vstoupit do města <ArrowRight size={17} /></span>
  </Link>;
}

function InactiveCity({ city }: { city: CityEdition }) {
  return <article className="city-selection-card city-selection-card-inactive" aria-label={`StudentHub ${city.name} – ${city.statusLabel}`}>
    <span className="city-selection-status"><Clock3 size={15} />{city.statusLabel}</span>
    <CityLogo city={city} />
    <span className="city-selection-action" aria-hidden="true">Zatím není dostupné</span>
  </article>;
}

export function CitySelectorPage() {
  return <main id="hlavni-obsah" className="city-selection-page">
    <header className="city-selection-heading">
      <span className="city-selection-kicker"><MapPinned size={18} />Studentský život na jednom místě</span>
      <h1>StudentHub</h1>
      <p className="city-selection-lead">Vyber si město</p>
      <p>Termíny, užitečná místa, komunita a praktické studentské služby přehledně podle města.</p>
    </header>
    <section className="city-selection-grid" aria-label="Výběr města">
      {cityEditions.map((city) => city.active && city.href ? <ActiveCity city={city as CityEdition & { href: `/${string}` }} key={city.slug} /> : <InactiveCity city={city} key={city.slug} />)}
    </section>
    <footer className="city-selection-footer"><p>StudentHub je nezávislý studentský projekt a není oficiální službou žádné vysoké školy.</p><LegalLinks includeCookieSettings /></footer>
  </main>;
}
