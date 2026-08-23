import type { Job, JobRewardUnit } from "@/lib/types";

export const fajnSalaryUnits: Readonly<Record<string, JobRewardUnit>> = {
  "1": "hour", "2": "month", "28": "day", "29": "agreement", "30": "fixed", "31": "volunteer",
};

export const fajnCurrencies: Readonly<Record<string, NonNullable<Job["rewardCurrency"]>>> = {
  "1": "CZK", "2": "EUR", "3": "USD", "4": "GBP",
};

export const fajnWorkloads: Readonly<Record<string, string>> = { "1": "Plný úvazek", "2": "Zkrácený úvazek" };
export const fajnBenefits: Readonly<Record<string, string>> = { "1": "Ubytování zdarma", "2": "Peníze po směně", "3": "Práce z domova" };
export const fajnSuitability: Readonly<Record<string, string>> = {
  "1": "Mateřská a rodičovská dovolená", "3": "Absolventi", "4": "OZP", "5": "OSVČ", "6": "Důchodci",
  "7": "Vhodné i pro uprchlíky z Ukrajiny", "8": "Od 15 let", "9": "Od 14 let",
};
export const fajnEducation: Readonly<Record<string, string>> = {
  "1": "Základní", "2": "Vyučení", "3": "Středoškolské", "6": "Vysokoškolské",
};

type Position = { label: string; field: Job["field"] };
const positionsByCategory: ReadonlyArray<[Job["field"], ReadonlyArray<[number, string]>]> = [
  ["Administrativa", [[1, "Administrativní pracovník"], [2, "Asistent – administrativa"], [8, "Sekretářka"], [492, "Domlouvání schůzek"], [503, "Vkládání dat do PC, systému"]]],
  ["Ostatní", [[57, "Kontrolor kvality – automobilový průmysl"], [313, "Prodejce vozů"], [316, "Ostatní – automobilový průmysl"]]],
  ["Gastro", [[283, "Animátor"], [285, "Číšník, servírka"], [286, "Delegát cestovní kanceláře, průvodce"], [287, "Kuchař, šéfkuchař"], [290, "Pokojská"], [292, "Prodejce zájezdů"], [294, "Recepční"], [297, "Tlumočník, překladatel"], [332, "Krupiér"], [334, "Domovník, správce objektu"], [368, "Au-pair"], [494, "Barman/ka"], [497, "Práce v rychlém občerstvení"], [501, "Pomocná síla v kuchyni"]]],
  ["Ostatní", [[442, "Dělník v potravinářství"], [157, "Kurýr, doručovatel"], [158, "Letuška, stevard"], [162, "Řidič/řidička"], [168, "Skladník"], [389, "Ostatní – doprava a zásobování"], [498, "Řidič, kurýr – nábor"], [39, "Pokladní, pokladník"], [42, "Účetní"]]],
  ["Elektro", [[370, "Elektrikář, elektrotechnik"]]],
  ["Ostatní", [[31, "Finanční poradce, specialista v bance"]]],
  ["IT", [[145, "Programátor, webmaster, kodér"], [392, "Lektor, instruktor"], [425, "Ostatní – informační technologie"]]],
  ["Ostatní", [[148, "Grafik"], [152, "Komparz"], [364, "Módní návrhář"], [456, "Manažer, pracovník provozu"], [175, "Copywriter"], [182, "Online marketing"], [298, "Anketář, marketingový průzkum"], [485, "Marketing – přímé oslovování klientů"], [489, "Vlasová modelka"], [505, "Pořadatel/ka, organizátor/ka"]]],
  ["Ostatní", [[207, "Doplňovač zboží, merchandiser"], [208, "Hosteska, promotér"], [213, "Obchodní zástupce, asistent, manažer"], [215, "Pracovník call centra"], [216, "Prodavač/ka"], [481, "Stánkový prodej"], [484, "Aktivní nabízení služeb / produktů"], [486, "Rozdávání letáků s nabízením produktů/služeb"], [487, "Přímý prodej – MLM"], [504, "Balení oblečení, zboží"], [506, "Zástupce vedoucího prodejny"], [47, "Ostraha"], [52, "Vrátný"], [203, "Personalista, recruiter"], [301, "Hospodyně"], [306, "Roznos letáků"], [307, "Uklízeč/ka"], [469, "Dělník, pomocný pracovník"], [502, "Stěhování, vyklízení"], [328, "Odborný právní pracovník, asistent"]]],
  ["Ostatní", [[233, "Hlídání dětí"], [239, "Obsluha čerpací stanice"], [289, "Plavčík"], [410, "Ostatní – služby"], [473, "Zákaznická podpora, helpdesk"], [477, "Hosteska na výstavišti nebo v restauraci"], [478, "Kosmetička, vizážistika, kadeřnice, manikérka"], [480, "Mystery shopping"], [482, "Venčení psů, péče o zvířata"], [110, "Realitní makléř"], [379, "Projektant, architekt, konstruktér"], [476, "Brigáda na stavbě"], [230, "Doučování"], [256, "Vysokoškolský učitel"], [488, "Lektor/ka kroužků, kurzů"], [398, "Výrobní dělník, montážník"], [475, "Kompletace produktů"], [495, "Operátor/ka výroby"], [269, "Pečovatel, ošetřovatel, osobní asistent"], [479, "Brigáda ve zdravotnictví"], [243, "Zahradník"], [500, "Sběr ovoce a jiných plodin"], [96, "Svářeč"], [472, "Nábor více lidí do databáze"], [490, "Ostatní brigáda"], [493, "Humanitární pomoc"], [459, "Kontrolor kvality"]]],
];

export const fajnPositions: Readonly<Record<string, Position>> = Object.fromEntries(
  positionsByCategory.flatMap(([field, rows]) => rows.map(([id, label]) => [String(id), { label, field }])),
);

// Identifikátory jsou z veřejných číselníků Fajn správy. Starý testovací export
// používá u zemí historické hodnoty 1/2, zatímco aktuální číselník uvádí 88/34.
export const czechCountryCodes = new Set(["1", "88"]);
export const nonCzechCountryCodes = new Set(["2", "34"]);
export const brnoCityCodes: Readonly<Record<string, string>> = {
  "582786": "Brno", "3702": "Brno", "3703": "Brno a okolí",
};
export const knownOutsideBrnoCityCodes: Readonly<Record<string, string>> = {
  "1185": "Ružomberok", "566985": "Žatec",
};

export function labelsFor(codes: string[] | undefined, catalog: Readonly<Record<string, string>>) {
  return (codes || []).map((code) => catalog[code]).filter((value): value is string => Boolean(value));
}
