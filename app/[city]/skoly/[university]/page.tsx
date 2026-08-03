import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SchoolHub } from "@/components/school-hub";
import { getPublishedCity, getUniversityIdsForPublishedCity } from "@/lib/city-data";
import { universityById } from "@/lib/universities";
type Props = { params: Promise<{ city: string; university: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const values = await params; const city = await getPublishedCity(values.city); const university = universityById(values.university); if (!city || !university || !(await getUniversityIdsForPublishedCity(city.id)).includes(university.id)) notFound(); return { title: `${university.shortName} · ${city.name}`, description: `Nezávislý studentský rozcestník pro ${university.shortName} ve městě ${city.name}.`, alternates: { canonical: `/${city.slug}/skoly/${university.slug}` } }; }
export default async function Page({ params }: Props) { const values = await params; const city = await getPublishedCity(values.city); const university = universityById(values.university); if (!city || !university || !(await getUniversityIdsForPublishedCity(city.id)).includes(university.id)) notFound(); return <SchoolHub universityId={university.id} city={city} />; }
