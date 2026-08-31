import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { adminCookie } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anon) {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) console.error("Admin logout failed:", error.message);
  }

  response.cookies.set(adminCookie.name, "", {
    ...adminCookie.options,
    maxAge: 0,
  });
  return response;
}
