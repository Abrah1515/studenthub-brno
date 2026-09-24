import type { CommunityEventCategory } from "@/lib/types";

export const communityEventCategories = [
  "Studium a vzdělávání", "Seznamovací akce", "Studentské spolky", "Kultura",
  "Hudba a koncerty", "Párty a společenské akce", "Sport a pohyb", "Kariéra a brigády",
  "Workshop a přednáška", "Technologie a věda", "Dobrovolnictví", "Wellbeing a zdraví",
  "Výlet", "Ostatní",
] as const satisfies readonly CommunityEventCategory[];

