import { describe, expect, it } from "vitest";
import { buddyPostSchema, communityEventSchema, contactMessageSchema, jobSubmissionSchema, pageViewSchema, placeCommentSchema, placeSuggestionSchema, reportSchema, serviceRequestSchema, serviceRequestUpdateSchema } from "@/lib/schemas";

const validRequest = { publicTitle: "Pomoc se zálohou notebooku", publicAlias: "Honza", name: "Jan Novák", email: "jan@example.cz", phone: "", serviceType: "backup", description: "Potřebuji bezpečně zazálohovat celý notebook.", location: "Brno-střed", preferredDate: "2026-08-10", consent: true, publishConsent: true, company: "" };

describe("validace poptávky", () => {
  it("přijme úplnou poptávku", () => expect(serviceRequestSchema.safeParse(validRequest).success).toBe(true));
  it("odmítne krátký popis", () => expect(serviceRequestSchema.safeParse({ ...validRequest, description: "Nefunguje" }).success).toBe(false));
  it("vyžaduje alespoň jeden kontakt", () => expect(serviceRequestSchema.safeParse({ ...validRequest, email: "", phone: "" }).success).toBe(false));
  it("odmítne vyplněný honeypot", () => expect(serviceRequestSchema.safeParse({ ...validRequest, company: "spam" }).success).toBe(false));
  it("nepustí kontaktní údaj do veřejného popisu ani při pozdější úpravě", () => {
    expect(serviceRequestSchema.safeParse({ ...validRequest, description: "Napište mi prosím na jan@example.cz kvůli opravě notebooku." }).success).toBe(false);
    expect(serviceRequestUpdateSchema.safeParse({ description: "Ozvěte se mi na telefon 777 123 456 kvůli podrobnostem." }).success).toBe(false);
  });
});

describe("validace návrhu brigády", () => {
  it("převede číselnou odměnu z formuláře", () => {
    const result = jobSubmissionSchema.safeParse({ companyName: "VoltLab", title: "Junior tester", contactEmail: "jobs@example.cz", location: "Brno", reward: "190", workload: "12 h týdně", description: "Testování zařízení a pečlivý zápis naměřených výsledků.", consent: true, company: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reward).toBe(190);
  });
});

describe("validace kontaktní zprávy", () => {
  const valid = { name: "Adam Novák", email: "adam@example.cz", subject: "Oprava údaje", message: "Na stránce místa je potřeba upravit provozní dobu.", company: "", cityId: "brno" };
  it("přijme úplnou zprávu", () => expect(contactMessageSchema.safeParse(valid).success).toBe(true));
  it("odmítne heslo v honeypotu a neplatný e-mail", () => { expect(contactMessageSchema.safeParse({ ...valid, company: "robot" }).success).toBe(false); expect(contactMessageSchema.safeParse({ ...valid, email: "neplatny" }).success).toBe(false); });
});

describe("validace veřejné komunitní akce", () => {
  const future = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const valid = { title: "Studentský koncert", category: "Kultura", startsAt: future, endsAt: "", venue: "Klub v centru Brna", description: "Veřejný studentský koncert s přístupným programem.", isFree: true, eventUrl: "https://example.cz/akce", authorEmail: "poradatel@example.cz", publicVenueConsent: true, company: "", cityId: "brno" };
  it("přijme úplnou budoucí akci", () => expect(communityEventSchema.safeParse(valid).success).toBe(true));
  it("odmítne minulost, HTTP odkaz, soukromé místo bez souhlasu a honeypot", () => { expect(communityEventSchema.safeParse({ ...valid, startsAt: "2020-01-01T18:00:00Z" }).success).toBe(false); expect(communityEventSchema.safeParse({ ...valid, eventUrl: "http://example.cz" }).success).toBe(false); expect(communityEventSchema.safeParse({ ...valid, publicVenueConsent: false }).success).toBe(false); expect(communityEventSchema.safeParse({ ...valid, company: "robot" }).success).toBe(false); });
  it("vyžaduje cenu u placené akce a omezuje konec na sedm dní", () => { expect(communityEventSchema.safeParse({ ...valid, isFree: false }).success).toBe(false); expect(communityEventSchema.safeParse({ ...valid, endsAt: new Date(Date.now() + 10 * 86_400_000).toISOString() }).success).toBe(false); });
});

describe("validace veřejné pomoci, parťáků a soukromé analytiky", () => {
  it("povolí jen bezpečně omezenou úpravu vlastní žádosti", () => { expect(serviceRequestUpdateSchema.safeParse({ publicTitle: "Opravený veřejný název" }).success).toBe(true); expect(serviceRequestUpdateSchema.safeParse({}).success).toBe(false); expect(serviceRequestUpdateSchema.safeParse({ email: "cizi@example.cz" }).success).toBe(false); });
  it("odmítne minulý termín a vyplněný honeypot parťáka", () => { const valid = { activityType: "study", approximateLocation: "Brno-střed", startsAt: new Date(Date.now() + 86_400_000).toISOString(), description: "Společné učení v knihovně na zkoušku z matematiky.", maxParticipants: 4, company: "" }; expect(buddyPostSchema.safeParse(valid).success).toBe(true); expect(buddyPostSchema.safeParse({ ...valid, startsAt: "2020-01-01T10:00:00.000Z" }).success).toBe(false); expect(buddyPostSchema.safeParse({ ...valid, company: "robot" }).success).toBe(false); });
  it("nepovolí analytice query, fragment ani celý referrer", () => { const valid = { path: "/brno/partak", cityId: "brno", sessionId: "11111111-1111-4111-8111-111111111111", referrerDomain: "studentsky-spolek.cz" }; expect(pageViewSchema.safeParse(valid).success).toBe(true); expect(pageViewSchema.safeParse({ ...valid, path: "/brno?email=test" }).success).toBe(false); expect(pageViewSchema.safeParse({ ...valid, referrerDomain: "https://example.cz/path?q=1" }).success).toBe(false); });
  it("hlášení vyžaduje známý typ, důvod a UUID", () => { expect(reportSchema.safeParse({ targetType: "buddy_post", targetId: "11111111-1111-4111-8111-111111111111", reason: "privacy", detail: "Obsah zveřejňuje osobní údaj.", cityId: "brno" }).success).toBe(true); expect(reportSchema.safeParse({ targetType: "offer", targetId: "neni-uuid", reason: "other" }).success).toBe(false); });
});

describe("validace komunitních míst",()=>{
  const valid={submissionType:"new",targetPlaceId:"",name:"Veřejná studovna",category:"study_room",address:"Veveří 1, Brno",latitude:49.2,longitude:16.6,locationConfirmed:true,description:"Klidná veřejná studovna s dostatkem pracovních stolů.",usefulnessReason:"Studenti zde mohou nerušeně pracovat.",sourceUrl:"https://example.cz/studovna",openingHours:"Po–Pá 8:00–20:00",priceLevel:"free",accessConditions:"Veřejně přístupné.",studySuitable:true,wifiAvailable:true,outletsAvailable:true,accessibility:"accessible",consent:true,photoRights:true,company:"",cityId:"brno"};
  it("přijme úplný návrh a zachová přesný bod",()=>{const result=placeSuggestionSchema.safeParse(valid);expect(result.success).toBe(true);if(result.success)expect(result.data.latitude).toBe(49.2)});
  it("odmítne nepotvrzenou polohu, honeypot, zkracovač a lokální odkaz",()=>{expect(placeSuggestionSchema.safeParse({...valid,locationConfirmed:false}).success).toBe(false);expect(placeSuggestionSchema.safeParse({...valid,company:"robot"}).success).toBe(false);expect(placeSuggestionSchema.safeParse({...valid,sourceUrl:"https://bit.ly/nebezpecne"}).success).toBe(false);expect(placeSuggestionSchema.safeParse({...valid,sourceUrl:"https://localhost/place"}).success).toBe(false)});
  it("vyžaduje cíl opravy a oba souhlasy",()=>{expect(placeSuggestionSchema.safeParse({...valid,submissionType:"correction"}).success).toBe(false);expect(placeSuggestionSchema.safeParse({...valid,consent:false}).success).toBe(false);expect(placeSuggestionSchema.safeParse({...valid,photoRights:false}).success).toBe(false)});
  it("komentář má 600 znaků, známé vlastnosti a honeypot",()=>{expect(placeCommentSchema.safeParse({body:"Užitečná zkušenost.",traits:["good_wifi"],company:""}).success).toBe(true);expect(placeCommentSchema.safeParse({body:"x".repeat(601),traits:[],company:""}).success).toBe(false);expect(placeCommentSchema.safeParse({body:"Text",traits:["stars"],company:""}).success).toBe(false);expect(placeCommentSchema.safeParse({body:"Text",traits:[],company:"robot"}).success).toBe(false)});
});
