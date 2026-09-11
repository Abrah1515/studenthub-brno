import type { Metadata } from "next";
import { CitySelectorPage } from "@/components/city-selector-page";

export const metadata: Metadata = {
  title: { absolute: "StudentHub | Studentský život ve tvém městě" },
  description: "Vyber si město a otevři studentské termíny, užitečná místa, komunitu a praktické služby ve StudentHubu.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "StudentHub | Studentský život ve tvém městě",
    description: "StudentHub spojuje studentské termíny, místa, komunitu a praktické služby podle města.",
    url: "/",
    images: [{ url: "/brand/cities/studenthub-cities-og-v1.png", width: 1200, height: 630, alt: "StudentHub Brno, Praha, Ostrava a Olomouc" }],
  },
};

export default function PlatformHomePage() { return <CitySelectorPage />; }
