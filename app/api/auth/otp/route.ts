import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ message: "Samostatné ověřovací odkazy byly nahrazeny jednotným účtem. Použijte registraci nebo přihlášení." }, { status: 410 });
}
