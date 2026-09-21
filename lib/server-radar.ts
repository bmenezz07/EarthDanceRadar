import { EVENT_CODE, SUPABASE_KEY, SUPABASE_URL } from "./config";

export type SyncPayload = {
  deviceId: string;
  deviceSecret: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  setTent?: boolean;
  tentLat?: number | null;
  tentLng?: number | null;
  tentAccuracy?: number | null;
};

export async function syncRadar(payload: SyncPayload, ipHint: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/radar_sync`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_device_id: payload.deviceId,
      p_device_secret: payload.deviceSecret,
      p_name: payload.name,
      p_event_code: EVENT_CODE,
      p_ip_hint: ipHint,
      p_lat: payload.lat ?? null,
      p_lng: payload.lng ?? null,
      p_accuracy: payload.accuracy ?? null,
      p_heading: payload.heading ?? null,
      p_set_tent: payload.setTent ?? false,
      p_tent_lat: payload.tentLat ?? null,
      p_tent_lng: payload.tentLng ?? null,
      p_tent_accuracy: payload.tentAccuracy ?? null
    }),
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`Falha de sincronização (${response.status})`);
  return response.json();
}

export function getClientIp(headers: Headers) {
  return (headers.get("x-forwarded-for")?.split(",")[0] || headers.get("x-real-ip") || "desconhecido").trim();
}

export function maskIp(ip: string) {
  if (ip.includes(":")) return `${ip.split(":").slice(0, 2).join(":")}:…`;
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.xxx.xxx` : "protegido";
}
