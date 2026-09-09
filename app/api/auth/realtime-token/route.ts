import { NextResponse } from "next/server";
import { authRouteClient } from "@/lib/auth-route-client";

export async function GET() {
  const response = NextResponse.json({ accessToken: null }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  const client = await authRouteClient(response);
  if (!client) return NextResponse.json({ message: "Autentizace není dostupná." }, { status: 503 });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user?.email_confirmed_at) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) return NextResponse.json({ message: "Relace vypršela." }, { status: 401 });
  const tokenResponse = NextResponse.json({ accessToken: data.session.access_token }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  for (const cookie of response.cookies.getAll()) tokenResponse.cookies.set(cookie);
  return tokenResponse;
}
