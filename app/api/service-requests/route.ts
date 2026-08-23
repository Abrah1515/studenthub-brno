import { NextResponse } from "next/server";

const archived = { message: "Technická pomoc byla ukončena a její historické záznamy zůstávají pouze v neveřejném archivu. Použijte Studentskou burzu." };

export async function GET() { return NextResponse.json({ ...archived, items: [] }, { status: 410, headers: { "Cache-Control": "no-store" } }); }
export async function POST() { return NextResponse.json(archived, { status: 410, headers: { "Cache-Control": "no-store" } }); }
