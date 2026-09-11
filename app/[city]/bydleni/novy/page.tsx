import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HousingListingForm } from "@/components/housing-listing-form";
import { PageHeading } from "@/components/page-heading";
import { UserLoginForm } from "@/components/user-login-form";
import { getPublishedCity } from "@/lib/city-data";
import { getCurrentAccount } from "@/lib/user-auth";
export const metadata:Metadata={title:"Přidat inzerát bydlení",robots:{index:false,follow:false}};
export default async function NewHousingPage({params}:{params:Promise<{city:string}>}){const city=await getPublishedCity((await params).city);if(!city||city.slug!=="brno")notFound();const account=await getCurrentAccount();return <div className="page-stack"><PageHeading eyebrow="Bydlení" title="Přidat inzerát" description="Zveřejněte pouze přibližnou lokalitu. Přesnou adresu a kontakt sdílejte až bezpečně v soukromém chatu."/>{!account?<UserLoginForm next="/brno/bydleni/novy" description="Pro vložení inzerátu se přihlaste potvrzeným e-mailem."/>:!account.complete?<div className="empty-state"><h2>Dokončete profil</h2><p>Pro bezpečí komunity doplňte uživatelské jméno, veřejnou přezdívku a přijměte pravidla.</p><a className="button button-primary" href="/brno/nastaveni#profil">Dokončit profil</a></div>:<HousingListingForm/>}</div>}
