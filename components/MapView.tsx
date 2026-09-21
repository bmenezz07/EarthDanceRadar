"use client";

import { useEffect, useRef } from "react";
import type { Coordinates } from "@/lib/geo";

export type MapPerson = Coordinates & { id: string; name: string; tent?: Coordinates | null };

type Props = {
  me: Coordinates | null;
  tent: Coordinates | null;
  friends: MapPerson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function MapView({ me, tent, friends, selectedId, onSelect }: Props) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  useEffect(() => {
    let alive = true;
    import("leaflet").then((L) => {
      if (!alive || !elementRef.current || mapRef.current) return;
      const center: [number, number] = me ? [me.lat, me.lng] : [-29.745, -50.01];
      const map = L.map(elementRef.current, { zoomControl: false, attributionControl: true }).setView(center, me ? 18 : 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        attribution: "© OpenStreetMap"
      }).addTo(map);
      L.control.zoom({ position: "topright" }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
    });
    return () => { alive = false; };
  }, [me]);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    const run = async () => {
      const L = await import("leaflet");
      const layer = layerRef.current!;
      layer.clearLayers();
      const icon = (emoji: string, active = false) => L.divIcon({
        className: "map-pin-wrap",
        html: `<div class="map-pin ${active ? "active" : ""}">${emoji}</div>`,
        iconSize: [44, 44], iconAnchor: [22, 22]
      });
      if (me) L.marker([me.lat, me.lng], { icon: icon("⚡", true), zIndexOffset: 1000 }).addTo(layer).bindTooltip("Você", { direction: "top" });
      if (tent) L.marker([tent.lat, tent.lng], { icon: icon("⛺", selectedId === "tent"), zIndexOffset: 900 }).addTo(layer).on("click", () => onSelect("tent")).bindTooltip("Sua barraca", { direction: "top" });
      friends.forEach((friend) => {
        L.marker([friend.lat, friend.lng], { icon: icon("●", selectedId === friend.id) }).addTo(layer).on("click", () => onSelect(friend.id)).bindTooltip(friend.name, { direction: "top" });
        if (friend.tent) L.marker([friend.tent.lat, friend.tent.lng], { icon: icon("⛺") }).addTo(layer).bindTooltip(`Barraca de ${friend.name}`, { direction: "top" });
      });
    };
    run();
  }, [me, tent, friends, selectedId, onSelect]);

  useEffect(() => {
    if (me && mapRef.current) mapRef.current.panTo([me.lat, me.lng], { animate: true });
  }, [me?.lat, me?.lng]);

  return <div ref={elementRef} className="map-canvas" aria-label="Mapa das pessoas e barracas" />;
}
