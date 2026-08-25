import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { adminCookie, makeDemoAdminToken } from "@/lib/admin-auth";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const fingerprint = requestFingerprint(request);

  if (!allowRequest(`admin-login:${fingerprint}`, 8, 15 * 60 * 1000)) {
    return NextResponse.json(
      { message: "Příliš mnoho pokusů. Počkejte 15 minut." },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;

  if (!body?.email || !body.password) {
    return NextResponse.json(
      { message: "Vyplňte e-mail a heslo." },
      { status: 422 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anon) {
    try {
      const response = NextResponse.json({ ok: true });

      const supabase = createServerClient(url, anon, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },

          setAll(values) {
            values.forEach(({ name, value }) => {
              request.cookies.set(name, value);
            });

            values.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });

      const claimedRole = String(data.user?.app_metadata?.role || "");

      const claimedCityId =
        typeof data.user?.app_metadata?.city_id === "string"
          ? data.user.app_metadata.city_id
          : null;

      const claimedFacultyId =
        typeof data.user?.app_metadata?.faculty_id === "string"
          ? data.user.app_metadata.faculty_id
          : null;

      if (
        error ||
        !data.user ||
        !["super_admin", "admin", "city_editor", "faculty_editor"].includes(
          claimedRole
        )
      ) {
        return NextResponse.json(
          {
            message:
              "Přihlášení se nezdařilo nebo účet nemá redakční roli.",
          },
          { status: 401 }
        );
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,city_id,faculty_id")
        .eq("id", data.user.id)
        .single();

      if (
        profileError ||
        !profile ||
        profile.role !== claimedRole ||
        (profile.city_id || null) !== claimedCityId ||
        (profile.faculty_id || null) !== claimedFacultyId
      ) {
        console.error("Admin profile verification failed:", {
          profileError,
          profile,
          claimedRole,
          claimedCityId,
          claimedFacultyId,
        });

        return NextResponse.json(
          {
            message:
              "Role účtu není synchronizovaná. Kontaktujte hlavního správce.",
          },
          { status: 403 }
        );
      }

      return response;
    } catch (error) {
      console.error("Admin login failed:", error);

      return NextResponse.json(
        {
          message:
            "Přihlašovací služba je dočasně nedostupná. Zkuste to znovu.",
        },
        { status: 503 }
      );
    }
  }

  const localAllowed =
    process.env.DEMO_MODE === "true" &&
    process.env.ALLOW_LOCAL_FILE_STORE === "true";

  const expectedPassword = process.env.ADMIN_DEMO_PASSWORD;

  if (
    !localAllowed ||
    !expectedPassword ||
    expectedPassword.length < 12 ||
    body.password !== expectedPassword
  ) {
    return NextResponse.json(
      { message: "Přihlášení se nezdařilo." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true, mode: "local" });

  response.cookies.set(
    adminCookie.name,
    makeDemoAdminToken(),
    adminCookie.options
  );

  return response;
}
