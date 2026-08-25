import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import { aggregatePlaceTraits,findPlaceDuplicates,isPlaceOpenNow,normalizePlaceText,placeCategoryCodes,placeCategoryLabels } from "@/lib/place-community";

describe("komunitní katalog míst",()=>{
  it("povoluje v CSP skutečný host mapových dlaždic",()=>{expect(readFileSync("next.config.ts","utf8")).toContain("https://tile.openstreetmap.org")});
  it("nabízí přesně dvanáct srozumitelných kategorií",()=>{expect(placeCategoryCodes).toHaveLength(12);expect(placeCategoryCodes.map((code)=>placeCategoryLabels[code])).toEqual(["Restaurace","Kavárna","Hospoda a bar","Bistro a rychlé občerstvení","Menza","Knihovna","Studovna","Coworking","Veřejné toalety","Sport a pohyb","Studentské služby","Ostatní"])});
  it("normalizuje diakritiku a právní dovětky názvu",()=>{expect(normalizePlaceText("  Kavárna ČÁRY, s. r. o. ")).toBe("kavarna cary")});
  it("najde stejné místo podle názvu, adresy, vzdálenosti, webu i aliasu",()=>{const result=findPlaceDuplicates({name:"Knihovna Jiřího Mahena",address:"Kobližná 4, Brno",lat:49.195,lng:16.61,website:"https://www.kjm.cz/pobocka"},[{id:"one",name:"KJM ústřední knihovna",address:"Kobližná 4, Brno",lat:49.19502,lng:16.61002,website:"https://kjm.cz",aliases:["Knihovna Jiřího Mahena"]}]);expect(result[0]).toMatchObject({id:"one"});expect(result[0].score).toBeGreaterThanOrEqual(100)});
  it("nespojuje podobný název na vzdáleném místě",()=>{expect(findPlaceDuplicates({name:"Studovna",address:"Veveří 1",lat:49.2,lng:16.6},[{id:"two",name:"Studovna",address:"Bohunice 1",lat:49.17,lng:16.57}])).toEqual([])});
  it("agreguje vlastnost až ze tří nezávislých profilů",()=>{expect(aggregatePlaceTraits([{trait:"good_wifi",authorId:"a"},{trait:"good_wifi",authorId:"a"},{trait:"good_wifi",authorId:"b"}])).toEqual([]);expect(aggregatePlaceTraits([{trait:"good_wifi",authorId:"a"},{trait:"good_wifi",authorId:"b"},{trait:"good_wifi",authorId:"c"}])).toEqual([{trait:"good_wifi",label:"Dobrá Wi‑Fi",count:3}])});
  it("vyhodnotí český rozsah otevírací doby v Europe/Prague",()=>{expect(isPlaceOpenNow("Po–Pá 8:00–18:00",new Date("2026-08-25T08:00:00Z"))).toBe(true);expect(isPlaceOpenNow("Po–Pá 8:00–18:00",new Date("2026-08-25T19:00:00Z"))).toBe(false);expect(isPlaceOpenNow("nonstop",new Date("2026-08-25T19:00:00Z"))).toBe(true)});
});
