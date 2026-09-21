import { NextRequest, NextResponse } from "next/server";
import { getClientIp, maskIp, syncRadar, type SyncPayload } from "@/lib/server-radar";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as SyncPayload;
    if (!payload.deviceId || !payload.deviceSecret || !payload.name) return NextResponse.json({ error: "Dispositivo inválido" }, { status: 400 });
    const ip = getClientIp(request.headers);
    const data = await syncRadar(payload, ip);
    return NextResponse.json({ success: true, clientIp: maskIp(ip), serverTime: Date.now(), friends: data.friends || [], myTent: data.me?.tent || null, me: data.me });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Erro inesperado" }, { status: 500 });
  }
}
