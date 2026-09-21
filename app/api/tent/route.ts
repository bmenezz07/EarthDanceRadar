import { NextRequest, NextResponse } from "next/server";
import { getClientIp, syncRadar, type SyncPayload } from "@/lib/server-radar";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as SyncPayload;
    if (!payload.deviceId || !payload.deviceSecret || !payload.name || payload.lat == null || payload.lng == null) {
      return NextResponse.json({ error: "GPS ainda não disponível" }, { status: 400 });
    }
    const data = await syncRadar({ ...payload, setTent: true, tentLat: payload.lat, tentLng: payload.lng, tentAccuracy: payload.accuracy }, getClientIp(request.headers));
    return NextResponse.json({ success: true, myTent: data.me?.tent, friends: data.friends || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Erro inesperado" }, { status: 500 });
  }
}
