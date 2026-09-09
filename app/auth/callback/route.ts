import { NextResponse } from "next/server";
import { authRouteClient, safeNextPath } from "@/lib/auth-route-client";
import { authCookieOptions } from "@/lib/auth-cookies";
import { createPasswordRecoveryIntent, passwordRecoveryIntentCookie } from "@/lib/password-recovery-intent";

export async function GET(request: Request) {
  const source = new URL(request.url); const code = source.searchParams.get("code"); const next = safeNextPath(source.searchParams.get("next"),"/nastaveni");
  const response = NextResponse.redirect(new URL(next, source.origin),{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  if (!code) return NextResponse.redirect(new URL("/ucet/prihlaseni?error=callback", source.origin));
  const client = await authRouteClient(response);
  if(!client) return NextResponse.redirect(new URL("/ucet/prihlaseni?error=callback", source.origin));
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if(error||!data.user?.email_confirmed_at) return NextResponse.redirect(new URL("/ucet/prihlaseni?error=callback", source.origin));
  const refreshed=await client.auth.refreshSession();
  if(refreshed.error||!refreshed.data.session) return NextResponse.redirect(new URL("/ucet/prihlaseni?error=callback", source.origin));
  if(next==="/ucet/obnova"){
    const intent=createPasswordRecoveryIntent(data.user.id);
    if(!intent) return NextResponse.redirect(new URL("/ucet/prihlaseni?error=callback", source.origin));
    response.cookies.set(passwordRecoveryIntentCookie,intent,authCookieOptions({maxAge:15*60}));
  }
  return response;
}
