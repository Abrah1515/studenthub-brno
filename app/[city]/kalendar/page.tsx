import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityCalendarPage } from "@/components/city-section-pages";
import { getPublishedCity } from "@/lib/city-data";
import { getAcademicCatalog } from "@/lib/academic-catalog";
import { resolveStudySelection } from "@/lib/universities";
import { parseStudyYear } from "@/lib/study-years";
type Props = { params: Promise<{ city: string }>; searchParams: Promise<{ university?: string; faculty?: string; year?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const city = await getPublishedCity((await params).city); if (!city) notFound(); return { title: `Akademický kalendář · ${city.name}`, alternates: { canonical: `/${city.slug}/kalendar` } }; }
export default async function Page({ params, searchParams }: Props) { const city = await getPublishedCity((await params).city); if (!city) notFound(); const [query, catalog] = await Promise.all([searchParams, getAcademicCatalog()]); const selection = resolveStudySelection(query.university, query.faculty, catalog); return <CityCalendarPage city={city} selection={{ universityId: selection.universityId || undefined, facultyId: selection.facultyId || undefined, studyYear: parseStudyYear(query.year) }} />; }
