export type Point = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6371000;
const toRad = (v: number) => (v * Math.PI) / 180;

export function distance(a: Point, b: Point) {
  const p1 = toRad(a.latitude);
  const p2 = toRad(b.latitude);
  const dp = toRad(b.latitude - a.latitude);
  const dl = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearing(a: Point, b: Point) {
  const p1 = toRad(a.latitude);
  const p2 = toRad(b.latitude);
  const dl = toRad(b.longitude - a.longitude);
  const y = Math.sin(dl) * Math.cos(p2);
  const x =
    Math.cos(p1) * Math.sin(p2) -
    Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180) / Math.PI + 360 % 360;
}

export function normalizeDegrees(v: number) {
  return ((v % 360) + 360) % 360;
}

export function direction(b: number) {
  return ["N", "NE", "L", "SE", "S", "SO", "O", "NO"][
    Math.round(normalizeDegrees(b) / 45) % 8
  ];
}

export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function relativePoint(origin: Point, target: Point, radius = 116) {
  const d = Math.min(distance(origin, target), 800);
  const b = toRad(bearing(origin, target));
  const scale = (d / 800) * radius;
  return { x: Math.sin(b) * scale, y: -Math.cos(b) * scale, d };
}

export function ageLabel(iso?: string | null) {
  if (!iso) return "sem localização";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 20) return "agora";
  if (seconds < 60) return `há ${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)} h`;
}
