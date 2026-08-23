import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { deleteRecord, insertRecord, listRecords, updateRecord } from "@/lib/data-store";
import { filterMarketplaceListings } from "@/lib/marketplace-public";
import { cleanMarketplaceText, consumeMarketplaceLimit, emailMarketplaceVerification, getPublicMarketplaceListings, marketplaceAbuseBlocked, marketplaceDuplicateFingerprint, marketplaceEmailConfigured, marketplaceHash, newMarketplaceToken, prohibitedMarketplaceReason, recordMarketplaceHistory, removeMarketplacePhotos, sanitizeAndUploadMarketplacePhoto } from "@/lib/marketplace-server";
import { requestFingerprint } from "@/lib/rate-limit";
import { marketplaceListingSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const source = new URL(request.url); const cityId = source.searchParams.get("city") || defaultCitySlug;
  if (!await getPublishedCity(cityId)) return NextResponse.json({ message: "Město není aktivní." }, { status: 404 });
  const items = await getPublicMarketplaceListings(cityId);
  const number = (key: string) => { const value = source.searchParams.get(key); return value && /^\d+$/.test(value) ? Number(value) : undefined; };
  const filtered = filterMarketplaceListings(items, { q: source.searchParams.get("q") || undefined, listingType: source.searchParams.get("type") || undefined, category: source.searchParams.get("category") || undefined, university: source.searchParams.get("university") || undefined, faculty: source.searchParams.get("faculty") || undefined, subject: source.searchParams.get("subject") || undefined, teacher: source.searchParams.get("teacher") || undefined, year: number("year"), format: source.searchParams.get("format") || undefined, condition: source.searchParams.get("condition") || undefined, status: source.searchParams.get("status") || undefined, minPrice: number("minPrice"), maxPrice: number("maxPrice"), location: source.searchParams.get("location") || undefined, sort: source.searchParams.get("sort") || undefined });
  return NextResponse.json({ items: filtered }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
}

export async function POST(request: Request) {
  if (!marketplaceEmailConfigured() && process.env.DEMO_MODE !== "true") return NextResponse.json({ message: "Zveřejnění je dočasně nedostupné, protože není nastavena produkční e-mailová brána." }, { status: 503 });
  if (!await consumeMarketplaceLimit(request, "create", 3, 24 * 60 * 60)) return NextResponse.json({ message: "Denní limit inzerátů byl vyčerpán. Zkuste to později." }, { status: 429 });
  const form = await request.formData().catch(() => null); if (!form) return NextResponse.json({ message: "Formulář se nepodařilo přečíst." }, { status: 422 });
  const optionalNumber = (key: string) => { const value = String(form.get(key) || "").trim(); return value ? Number(value) : undefined; };
  const priceMode = String(form.get("priceMode") || "fixed");
  const parsed = marketplaceListingSchema.safeParse({ listingType: form.get("listingType"), category: form.get("category"), title: form.get("title"), shortDescription: form.get("shortDescription"), description: form.get("description"), priceMode, priceAmount: priceMode === "free" ? 0 : optionalNumber("priceAmount"), priceScope: form.get("priceScope"), universityId: form.get("universityId") || "", facultyId: form.get("facultyId") || "", studyProgram: form.get("studyProgram") || "", subjectName: form.get("subjectName") || "", subjectCode: form.get("subjectCode") || "", teacherName: form.get("teacherName") || "", recommendedYear: optionalNumber("recommendedYear"), semester: form.get("semester"), academicYear: form.get("academicYear") || "", materialFormat: form.get("materialFormat"), itemCondition: form.get("itemCondition") || "", handoffMethod: form.get("handoffMethod"), handoffLocation: form.get("handoffLocation") || "", publicAlias: form.get("publicAlias"), sellerEmail: form.get("sellerEmail"), copyrightConfirmed: String(form.get("copyrightConfirmed")) === "true", ownNotesConfirmed: String(form.get("ownNotesConfirmed")) === "true", privacyConsent: String(form.get("privacyConsent")) === "true", company: form.get("company") || "", cityId: form.get("cityId") || defaultCitySlug });
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte vyplněné údaje.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const city = await getPublishedCity(parsed.data.cityId || defaultCitySlug); if (!city) return NextResponse.json({ message: "Město není aktivní." }, { status: 422 });
  const photos = form.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  if (photos.length > 3) return NextResponse.json({ message: "Lze přidat nejvýše tři fotografie." }, { status: 422 });
  const clean = { title: cleanMarketplaceText(parsed.data.title), shortDescription: cleanMarketplaceText(parsed.data.shortDescription), description: cleanMarketplaceText(parsed.data.description, true), studyProgram: cleanMarketplaceText(parsed.data.studyProgram || ""), subjectName: cleanMarketplaceText(parsed.data.subjectName || ""), subjectCode: cleanMarketplaceText(parsed.data.subjectCode || ""), teacherName: cleanMarketplaceText(parsed.data.teacherName || ""), handoffLocation: cleanMarketplaceText(parsed.data.handoffLocation || ""), publicAlias: cleanMarketplaceText(parsed.data.publicAlias) };
  const sellerEmail = parsed.data.sellerEmail.toLowerCase(); const sellerEmailHash = marketplaceHash(sellerEmail); const requestHash = requestFingerprint(request);
  if (await marketplaceAbuseBlocked(sellerEmailHash, requestHash)) return NextResponse.json({ message: "Z tohoto kontaktu nyní nelze zveřejnit další inzerát." }, { status: 403 });
  const duplicateFingerprint = marketplaceDuplicateFingerprint({ title: clean.title, category: parsed.data.category, subjectCode: clean.subjectCode });
  const duplicate = (await listRecords("marketplace_listings")).some((row) => row.seller_email_hash === sellerEmailHash && row.duplicate_fingerprint === duplicateFingerprint && ["pending_verification", "active", "reserved", "hidden"].includes(String(row.status)));
  if (duplicate) return NextResponse.json({ message: "Stejný inzerát už byl vytvořen." }, { status: 409 });
  const verification = newMarketplaceToken(); const management = newMarketplaceToken(); const id = randomUUID(); const createdAt = new Date().toISOString(); const verificationExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const rejection = prohibitedMarketplaceReason(clean);
  const base = { id, city_id: city.id, listing_type: parsed.data.listingType, category: parsed.data.category, title: clean.title, short_description: clean.shortDescription, description: clean.description, price_mode: parsed.data.priceMode, price_amount: parsed.data.priceMode === "free" ? 0 : parsed.data.priceAmount ?? null, price_scope: parsed.data.priceScope, university_id: parsed.data.universityId || null, faculty_id: parsed.data.facultyId || null, study_program: clean.studyProgram || null, subject_name: clean.subjectName || null, subject_code: clean.subjectCode || null, teacher_name: clean.teacherName || null, recommended_year: parsed.data.recommendedYear || null, semester: parsed.data.semester, academic_year: parsed.data.academicYear || null, material_format: parsed.data.materialFormat, item_condition: parsed.data.materialFormat === "digital" ? null : parsed.data.itemCondition, handoff_method: parsed.data.handoffMethod, handoff_location: clean.handoffLocation || null, public_alias: clean.publicAlias, seller_email: sellerEmail, seller_email_hash: sellerEmailHash, request_fingerprint: requestHash, verification_token_hash: verification.hash, verification_expires_at: verificationExpiresAt, management_token_hash: management.hash, duplicate_fingerprint: duplicateFingerprint, copyright_confirmed: true, own_notes_confirmed: parsed.data.category === "own_notes" ? parsed.data.ownNotesConfirmed : false, privacy_consent_at: createdAt, status: rejection ? "rejected" : "pending_verification", automated_rejection_reason: rejection };
  const saved = await insertRecord("marketplace_listings", base);
  await recordMarketplaceHistory(id, rejection ? "rejected" : "created", null, base.status, "system", rejection ? { reason: rejection } : {});
  if (rejection) return NextResponse.json({ message: rejection }, { status: 422 });
  const uploaded: Record<string, unknown>[] = [];
  try {
    for (let index = 0; index < photos.length; index += 1) uploaded.push(await sanitizeAndUploadMarketplacePhoto(photos[index], id, index));
    for (const photo of uploaded) await insertRecord("marketplace_listing_photos", photo);
  } catch (error) {
    await removeMarketplacePhotos(uploaded.map((photo) => photo.storage_path));
    for (const photo of uploaded) await deleteRecord("marketplace_listing_photos", String(photo.id)).catch(() => null);
    await updateRecord("marketplace_listings", id, { status: "rejected", automated_rejection_reason: "Fotografie neprošla bezpečnostní kontrolou." });
    await recordMarketplaceHistory(id, "rejected", "pending_verification", "rejected", "system", { reason: "unsafe_image" });
    return NextResponse.json({ message: error instanceof Error ? error.message : "Fotografie neprošla bezpečnostní kontrolou." }, { status: 422 });
  }
  const origin = process.env.DEMO_MODE === "true" ? new URL(request.url).origin : (process.env.NEXT_PUBLIC_SITE_URL || "https://studenthub-brno.vercel.app").replace(/\/$/, "");
  const verifyUrl = `${origin}/${city.slug}/burza/overit?id=${encodeURIComponent(String(saved.id))}#verification=${verification.token}&management=${management.token}`;
  const delivery = process.env.DEMO_MODE === "true" && !marketplaceEmailConfigured() ? { ok: true as const, id: null } : await emailMarketplaceVerification({ email: sellerEmail, title: clean.title, verifyUrl });
  if (!delivery.ok) {
    await removeMarketplacePhotos(uploaded.map((photo) => photo.storage_path));
    for (const photo of uploaded) await deleteRecord("marketplace_listing_photos", String(photo.id)).catch(() => null);
    await updateRecord("marketplace_listings", id, { status: "rejected", automated_rejection_reason: "Ověřovací e-mail se nepodařilo doručit." }); await recordMarketplaceHistory(id, "rejected", "pending_verification", "rejected", "system", { reason: delivery.reason });
    return NextResponse.json({ message: "Inzerát nebyl zveřejněn, protože se nepodařilo doručit ověřovací e-mail. Zkuste to později." }, { status: 502 });
  }
  return NextResponse.json({ id: String(saved.id), ...(process.env.DEMO_MODE === "true" ? { verifyUrl } : {}), message: "Ověřovací odkaz jsme poslali na zadaný e-mail. Inzerát zatím není veřejný." }, { status: 201 });
}
