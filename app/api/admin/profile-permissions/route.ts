import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { allowRequest } from "@/lib/rate-limit";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

const schema = z.object({
  profileId: z.string().uuid(),
  action: z.enum(["grant", "suspend", "reactivate", "revoke"]),
  reason: z.string().trim().min(3, "Doplňte interní důvod.").max(800),
});

const messages = {
  grant: "Přímé zveřejňování bylo přiděleno.",
  suspend: "Přímé zveřejňování bylo dočasně pozastaveno.",
  reactivate: "Přímé zveřejňování bylo znovu aktivováno.",
  revoke: "Přímé zveřejňování bylo odebráno.",
} as const;

export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (admin?.role !== "super_admin" || admin.mode !== "supabase") return NextResponse.json({ message: "Oprávnění může spravovat pouze přihlášený hlavní superadmin." }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Správa oprávnění vyžaduje produkční Supabase." }, { status: 503 });
  if (!allowRequest(`profile-permission:${admin.id}`, 40, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit změn oprávnění byl dočasně vyčerpán." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte profil, akci a interní důvod.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  if (parsed.data.profileId === admin.id) return NextResponse.json({ message: "Superadmin si toto neadministrátorské oprávnění nemůže přidělit sám." }, { status: 403 });

  const client = createServiceClient();
  const { error } = await client.rpc("manage_trusted_event_publisher", {
    target_profile_id: parsed.data.profileId,
    requested_action: parsed.data.action,
    internal_reason: parsed.data.reason,
    actor_profile_id: admin.id,
  });
  if (error) {
    const eligibility = /not eligible|regular user|email|active/i.test(error.message);
    console.error("profile_permission_change_failed", { action: parsed.data.action, targetProfileId: parsed.data.profileId, code: error.code });
    return NextResponse.json({ message: eligibility ? "Profil nesplňuje podmínky: potvrzený e-mail, aktivní běžný účet, dokončený profil a přijatá pravidla komunity." : "Změnu oprávnění se nepodařilo bezpečně uložit." }, { status: eligibility ? 409 : 422 });
  }
  return NextResponse.json({ message: messages[parsed.data.action] });
}
