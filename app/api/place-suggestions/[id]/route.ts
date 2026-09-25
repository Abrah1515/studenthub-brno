import { NextResponse } from "next/server";
import { cleanPlaceText, removePlacePhotos, sanitizeAndUploadPlacePhoto, signedPlacePhotos } from "@/lib/place-community-server";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { placeSuggestionSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase-server";
import { getCurrentAccount } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };
function bool(value: FormDataEntryValue | null) { return value === "true" || value === "on" || value === "1"; }
async function owned(id: string) {
  const account = await getCurrentAccount();
  if (!account) return { account: null, item: null };
  const { data: item } = await createServiceClient().from("place_submissions").select("*").eq("id", id).eq("author_id", account.id).maybeSingle();
  return { account, item };
}

export async function GET(_request: Request, context: Context) {
  const id = (await context.params).id; const result = await owned(id);
  if (!result.item) return NextResponse.json({ message: "Návrh nebyl nalezen." }, { status: 404 });
  const { data: photoRows } = await createServiceClient().from("place_submission_photos").select("id,submission_id,storage_path,width,height,sort_order").eq("submission_id", id).order("sort_order");
  const photos = await signedPlacePhotos((photoRows || []) as Record<string, unknown>[]);
  return NextResponse.json({ item: { ...result.item, photos } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, context: Context) {
  const id = (await context.params).id; const result = await owned(id);
  if (!result.account) return NextResponse.json({ message: "Přihlaste se." }, { status: 401 });
  if (!result.item) return NextResponse.json({ message: "Návrh nebyl nalezen." }, { status: 404 });
  if (!result.account.complete || result.account.accountStatus !== "active") return NextResponse.json({ message: "Profil není připravený k úpravám." }, { status: 403 });
  if (!allowRequest(`place-suggestion-edit:${result.account.id}:${requestFingerprint(request)}`, 30, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit úprav byl vyčerpán." }, { status: 429 });
  const item = result.item; const client = createServiceClient(); const multipart = request.headers.get("content-type")?.includes("multipart/form-data");
  if (!multipart) {
    const input = await request.json().catch(() => null);
    if (input?.action !== "withdraw") return NextResponse.json({ message: "Neplatná úprava." }, { status: 422 });
    if (!["pending", "changes_requested"].includes(String(item.status))) return NextResponse.json({ message: "Tento návrh už nelze stáhnout." }, { status: 409 });
    const now = new Date().toISOString(); const { error } = await client.from("place_submissions").update({ status: "withdrawn", reviewed_at: now }).eq("id", id).eq("author_id", result.account.id);
    if (error) return NextResponse.json({ message: "Návrh se nepodařilo stáhnout." }, { status: 422 });
    await client.from("place_submission_history").insert({ submission_id: id, actor_id: result.account.id, action: "withdrawn", snapshot: { previousStatus: item.status } });
    return NextResponse.json({ message: "Návrh byl stažen." });
  }
  if (!["draft", "pending", "changes_requested"].includes(String(item.status))) return NextResponse.json({ message: "Tento návrh už nelze přímo upravit." }, { status: 409 });
  const form = await request.formData().catch(() => null); if (!form) return NextResponse.json({ message: "Formulář se nepodařilo přečíst." }, { status: 422 });
  const parsed = placeSuggestionSchema.safeParse({ submissionType: form.get("submissionType") || item.submission_type, targetPlaceId: form.get("targetPlaceId") || item.target_place_id || "", name: form.get("name"), category: form.get("category"), address: form.get("address"), latitude: form.get("latitude"), longitude: form.get("longitude"), locationConfirmed: bool(form.get("locationConfirmed")), description: form.get("description"), usefulnessReason: form.get("usefulnessReason"), sourceUrl: form.get("sourceUrl"), openingHours: form.get("openingHours") || "", priceLevel: form.get("priceLevel") || "", accessConditions: form.get("accessConditions") || "", studySuitable: bool(form.get("studySuitable")), wifiAvailable: bool(form.get("wifiAvailable")), outletsAvailable: bool(form.get("outletsAvailable")), accessibility: form.get("accessibility") || "", consent: bool(form.get("consent")), photoRights: bool(form.get("photoRights")), company: form.get("company") || "", cityId: item.city_id });
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte povinné údaje.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const removeIds = new Set(form.getAll("removePhotoIds").map(String)); const { data: existingPhotos } = await client.from("place_submission_photos").select("id,storage_path").eq("submission_id", id);
  const removed = (existingPhotos || []).filter((photo) => removeIds.has(String(photo.id))); const kept = (existingPhotos || []).filter((photo) => !removeIds.has(String(photo.id)));
  const files = form.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  if (kept.length + files.length > 5) return NextResponse.json({ message: "Návrh může mít nejvýše 5 fotografií." }, { status: 422 });
  const value = parsed.data; const now = new Date().toISOString(); const uploaded: Record<string, unknown>[] = [];
  try {
    for (let index = 0; index < files.length; index += 1) uploaded.push(await sanitizeAndUploadPlacePhoto(files[index], id, kept.length + index));
    if (uploaded.length) { const uploadResult = await client.from("place_submission_photos").insert(uploaded); if (uploadResult.error) throw uploadResult.error; }
    if (removed.length) { await removePlacePhotos(removed.map((photo) => photo.storage_path)); await client.from("place_submission_photos").delete().in("id", removed.map((photo) => photo.id)).eq("submission_id", id); }
    const changes = { name: cleanPlaceText(value.name), category: value.category, address: cleanPlaceText(value.address), latitude: value.latitude, longitude: value.longitude, location_confirmed_at: now, description: cleanPlaceText(value.description, true), usefulness_reason: cleanPlaceText(value.usefulnessReason, true), source_url: value.sourceUrl, opening_hours: value.openingHours || null, price_level: value.priceLevel || null, access_conditions: value.accessConditions ? cleanPlaceText(value.accessConditions, true) : null, study_suitable: value.studySuitable, wifi_available: value.wifiAvailable, outlets_available: value.outletsAvailable, accessibility: value.accessibility || null, status: "pending", submitted_at: now, reviewed_at: null, reviewed_by: null };
    const { error } = await client.from("place_submissions").update(changes).eq("id", id).eq("author_id", result.account.id); if (error) throw error;
    await client.from("place_submission_history").insert({ submission_id: id, actor_id: result.account.id, action: "edited", snapshot: { previousStatus: item.status, changedFields: Object.keys(changes), removedPhotoCount: removed.length, addedPhotoCount: uploaded.length } });
    return NextResponse.json({ id, status: "pending", message: "Úpravy byly odeslány ke kontrole." });
  } catch (error) {
    await removePlacePhotos(uploaded.map((photo) => photo.storage_path));
    return NextResponse.json({ message: error instanceof Error ? error.message : "Návrh se nepodařilo upravit." }, { status: 422 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const id = (await context.params).id; const result = await owned(id);
  if (!result.account) return NextResponse.json({ message: "Přihlaste se." }, { status: 401 });
  if (!result.item) return NextResponse.json({ message: "Návrh nebyl nalezen." }, { status: 404 });
  if (!["draft", "withdrawn"].includes(String(result.item.status))) return NextResponse.json({ message: "Odstranit lze pouze rozpracovaný nebo stažený návrh." }, { status: 409 });
  const client = createServiceClient(); const { data: photos } = await client.from("place_submission_photos").select("storage_path").eq("submission_id", id);
  await removePlacePhotos((photos || []).map((photo) => photo.storage_path)); await client.from("place_submissions").delete().eq("id", id).eq("author_id", result.account.id);
  return new NextResponse(null, { status: 204 });
}
