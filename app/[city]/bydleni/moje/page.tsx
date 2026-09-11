import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HousingManager } from "@/components/housing-manager";
import { UserLoginForm } from "@/components/user-login-form";
import { getPublishedCity } from "@/lib/city-data";
import { getCurrentAccount } from "@/lib/user-auth";
export const metadata:Metadata={title:"Moje inzeráty bydlení",robots:{index:false,follow:false}};
export default async function MyHousingPage({params}:{params:Promise<{city:string}>}){const city=await getPublishedCity((await params).city);if(!city||city.slug!=="brno")notFound();const account=await getCurrentAccount();return account?<HousingManager/>:<UserLoginForm next="/brno/bydleni/moje" description="Pro správu vlastních inzerátů se přihlaste."/>;}
