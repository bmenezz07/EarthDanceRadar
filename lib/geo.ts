export type Coordinates = { lat: number; lng: number };

const toRad = (value: number) => (value * Math.PI) / 180;
const toDeg = (value: number) => (value * 180) / Math.PI;

export function calculateDistance(a: Coordinates, b: Coordinates) {
  const earthRadius = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function calculateBearing(a: Coordinates, b: Coordinates) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function relativeAngle(targetBearing: number, deviceHeading: number) {
  return (targetBearing - deviceHeading + 360) % 360;
}

export function humanDirection(angle: number) {
  const signed = angle > 180 ? angle - 360 : angle;
  if (Math.abs(signed) < 8) return "EM FRENTE";
  if (Math.abs(signed) > 172) return "ATRÁS DE VOCÊ";
  return `${Math.abs(Math.round(signed))}° ${signed > 0 ? "À DIREITA" : "À ESQUERDA"}`;
}

export function formatDistance(meters: number | null) {
  if (meters === null) return "—";
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}
