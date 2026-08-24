import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketplaceListingForm } from "@/components/marketplace-listing-form";
import { PageHeading } from "@/components/page-heading";
import { UserLoginForm } from "@/components/user-login-form";
import { getPublishedCity } from "@/lib/city-data";
import { getCurrentAccount } from "@/lib/user-auth";

type Props = { params: Promise<{ city: string }> };
export const metadata: Metadata = { title: "Vložit inzerát do Studentské burzy", robots: { index: false, follow: false } };
export default async function NewMarketplaceListingPage({ params }: Props) { const city = await getPublishedCity((await params).city); if (!city) notFound(); const account = await getCurrentAccount(); return <div className="page-stack marketplace-create-page"><PageHeading eyebrow="Studentská burza" title="Vložit inzerát" description="Inzerát bude propojený s vaším veřejným profilem. Kontaktní adresa nebude součástí veřejné stránky ani API." />{!account ? <UserLoginForm next={`/${city.slug}/burza/novy`} description="Pro vložení inzerátu se přihlaste. Po návratu budete pokračovat zde." /> : !account.complete ? <div className="empty-state"><h2>Dokončete veřejný profil</h2><p>Stačí přezdívka, unikátní uživatelské jméno a souhlas s pravidly komunity.</p><a className="button button-primary" href="/nastaveni#profil">Doplnit profil</a></div> : <MarketplaceListingForm city={city} />}</div>; }
