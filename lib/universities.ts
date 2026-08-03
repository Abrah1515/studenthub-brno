import type { AcademicCatalog, Faculty, University } from "@/lib/types";

const verifiedAt = "2026-08-02T00:00:00.000Z";

export const universities: University[] = [
  { id: "muni", slug: "muni", name: "Masarykova univerzita", shortName: "MUNI", color: "#2856a4", officialUrl: "https://www.muni.cz/", active: true, lastVerifiedAt: verifiedAt, campuses: [{ id: "brno-muni-bohunice", cityId: "brno", name: "Bohunice", lat: 49.1774, lng: 16.5692 }, { id: "brno-muni-veveri", cityId: "brno", name: "Veveří", lat: 49.209, lng: 16.596 }, { id: "brno-muni-vinarska", cityId: "brno", name: "Vinařská", lat: 49.1879, lng: 16.5849 }] },
  { id: "vut", slug: "vut", name: "Vysoké učení technické v Brně", shortName: "VUT", color: "#0b6b4d", officialUrl: "https://www.vut.cz/", active: true, lastVerifiedAt: verifiedAt, campuses: [{ id: "brno-vut-ppv", cityId: "brno", name: "Pod Palackého vrchem", lat: 49.2292, lng: 16.5747 }, { id: "brno-vut-udolni", cityId: "brno", name: "Údolní", lat: 49.1988, lng: 16.5982 }] },
  { id: "mendelu", slug: "mendelu", name: "Mendelova univerzita v Brně", shortName: "MENDELU", color: "#52752c", officialUrl: "https://mendelu.cz/", active: true, lastVerifiedAt: verifiedAt, campuses: [{ id: "brno-mendelu-cerna-pole", cityId: "brno", name: "Černá Pole", lat: 49.2115, lng: 16.6166 }] },
  { id: "vetuni", slug: "vetuni", name: "Veterinární univerzita Brno", shortName: "VETUNI", color: "#7b4e2d", officialUrl: "https://www.vetuni.cz/", active: true, lastVerifiedAt: verifiedAt, campuses: [{ id: "brno-vetuni-kralovo-pole", cityId: "brno", name: "Královo Pole", lat: 49.2175, lng: 16.5965 }] },
  { id: "jamu", slug: "jamu", name: "Janáčkova akademie múzických umění", shortName: "JAMU", color: "#7c3a68", officialUrl: "https://www.jamu.cz/", active: true, lastVerifiedAt: verifiedAt, campuses: [{ id: "brno-jamu-centrum", cityId: "brno", name: "Centrum", lat: 49.1968, lng: 16.6085 }] },
];

const faculty = (id: string, universityId: string, name: string, shortName: string, officialUrl: string): Faculty => ({ id, slug: id, universityId, name, shortName, officialUrl, active: true, lastVerifiedAt: verifiedAt });
export const faculties: Faculty[] = [
  faculty("muni-fi", "muni", "Fakulta informatiky", "FI", "https://www.fi.muni.cz/"), faculty("muni-prf", "muni", "Přírodovědecká fakulta", "PřF", "https://www.sci.muni.cz/"), faculty("muni-ff", "muni", "Filozofická fakulta", "FF", "https://www.phil.muni.cz/"), faculty("muni-fss", "muni", "Fakulta sociálních studií", "FSS", "https://www.fss.muni.cz/"), faculty("muni-esf", "muni", "Ekonomicko-správní fakulta", "ESF", "https://www.econ.muni.cz/"), faculty("muni-lf", "muni", "Lékařská fakulta", "LF", "https://www.med.muni.cz/"), faculty("muni-prav", "muni", "Právnická fakulta", "PrF", "https://www.law.muni.cz/"), faculty("muni-pedf", "muni", "Pedagogická fakulta", "PdF", "https://www.ped.muni.cz/"), faculty("muni-fsps", "muni", "Fakulta sportovních studií", "FSpS", "https://www.fsps.muni.cz/"), faculty("muni-faf", "muni", "Farmaceutická fakulta", "FaF", "https://www.pharm.muni.cz/"),
  faculty("vut-fekt", "vut", "Fakulta elektrotechniky a komunikačních technologií", "FEKT", "https://www.fekt.vut.cz/"), faculty("vut-fit", "vut", "Fakulta informačních technologií", "FIT", "https://www.fit.vut.cz/"), faculty("vut-fast", "vut", "Fakulta stavební", "FAST", "https://www.fce.vut.cz/"), faculty("vut-fsi", "vut", "Fakulta strojního inženýrství", "FSI", "https://www.fme.vutbr.cz/"), faculty("vut-fa", "vut", "Fakulta architektury", "FA", "https://www.fa.vut.cz/"), faculty("vut-fch", "vut", "Fakulta chemická", "FCH", "https://www.fch.vut.cz/"), faculty("vut-fp", "vut", "Fakulta podnikatelská", "FP", "https://www.fp.vut.cz/"), faculty("vut-favu", "vut", "Fakulta výtvarných umění", "FaVU", "https://www.favu.vut.cz/"),
  faculty("mendelu-af", "mendelu", "Agronomická fakulta", "AF", "https://af.mendelu.cz/"), faculty("mendelu-ldf", "mendelu", "Lesnická a dřevařská fakulta", "LDF", "https://ldf.mendelu.cz/"), faculty("mendelu-pef", "mendelu", "Provozně ekonomická fakulta", "PEF", "https://pef.mendelu.cz/"), faculty("mendelu-zf", "mendelu", "Zahradnická fakulta", "ZF", "https://zf.mendelu.cz/"), faculty("mendelu-frrms", "mendelu", "Fakulta regionálního rozvoje a mezinárodních studií", "FRRMS", "https://frrms.mendelu.cz/"),
  faculty("vetuni-fvl", "vetuni", "Fakulta veterinárního lékařství", "FVL", "https://fvl.vetuni.cz/"), faculty("vetuni-fvhe", "vetuni", "Fakulta veterinární hygieny a ekologie", "FVHE", "https://fvhe.vetuni.cz/"),
  faculty("jamu-hf", "jamu", "Hudební fakulta", "HF", "https://hf.jamu.cz/"), faculty("jamu-df", "jamu", "Divadelní fakulta", "DF", "https://df.jamu.cz/"),
];

export const fallbackAcademicCatalog: AcademicCatalog = { universities, faculties };

export function universityById(id?: string | null) { return universities.find((item) => item.id === id); }
export function facultiesFor(universityId?: string | null) { return faculties.filter((item) => item.universityId === universityId); }
export function facultyById(id?: string | null) { return faculties.find((item) => item.id === id); }
export function resolveStudySelection(universityId?: string | null, facultyId?: string | null, catalog: AcademicCatalog = fallbackAcademicCatalog) {
  const university = catalog.universities.find((item) => item.id === universityId && item.active);
  const faculty = university ? catalog.faculties.find((item) => item.id === facultyId && item.universityId === university.id && item.active) : undefined;
  return { universityId: university?.id || "", facultyId: faculty?.id || "" };
}
