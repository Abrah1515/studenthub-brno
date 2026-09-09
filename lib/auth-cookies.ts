import type { NextResponse } from "next/server";

type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
};

export function authCookieOptions(options: CookieOptions = {}): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production",
  };
}

export function isSupabaseSessionCookie(name: string) {
  return name.startsWith("sb-") && (name.includes("auth-token") || name.includes("code-verifier"));
}

export function clearSupabaseSessionCookies(response: NextResponse, values: Array<{ name: string }>) {
  for (const { name } of values) {
    if (!isSupabaseSessionCookie(name)) continue;
    response.cookies.set(name, "", authCookieOptions({ expires: new Date(0), maxAge: 0 }));
  }
}

export function copyResponseCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}
