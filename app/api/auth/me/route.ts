import { NextResponse } from "next/server";
import { getCurrentAccount, getCurrentUser } from "@/lib/user-auth";
export async function GET() { const [user, profile] = await Promise.all([getCurrentUser(), getCurrentAccount()]); return NextResponse.json({ user, profile }, { headers: { "Cache-Control": "private, no-store" } }); }
