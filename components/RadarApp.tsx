"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BellRing, Compass, Map, Navigation, Pencil, Radio, RefreshCw, Satellite, TentTree, Users, Wifi, WifiOff, X } from "lucide-react";
import { calculateBearing, calculateDistance, formatDistance, humanDirection, relativeAngle, type Coordinates } from "@/lib/geo";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="map-loading"><RefreshCw className="spin" /> Preparando mapa…</div> });

type Position = Coordinates & { accuracy: number; heading?: number | null };
type Tent = Coordinates & { accuracy?: number; savedAt?: number };
type Friend = Position & { id: string; name: string; lastSeen: number; tent?: Tent | null };
type Target = { id: string; name: string; type: "tent" | "friend"; coords: Coordinates };
type SyncResponse = { success: boolean; clientIp?: string; friends?: Friend[]; myTent?: Tent | null; error?: string };

const STORAGE = {
  id: "edr.device.id", secret: "edr.device.secret", name: "edr.device.name",
  tent: "edr.my.tent", friends: "edr.friends.cache"
};

const codenames = ["Rave Explorer", "Peace Dancer", "Cosmic Nomad", "Neon Heart", "Solar Traveler", "Trance Wanderer"];

function randomName(id: string) {
  const sum = [...id].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return `${codenames[sum % codenames.length]} #${(sum % 90) + 10}`;
}

function getIdentity() {
  let id = localStorage.getItem(STORAGE.id);
  let secret = localStorage.getItem(STORAGE.secret);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(STORAGE.id, id); }
  if (!secret) { secret = `${crypto.randomUUID()}${crypto.randomUUID()}`; localStorage.setItem(STORAGE.secret, secret); }
  const name = localStorage.getItem(STORAGE.name) || randomName(id);
  localStorage.setItem(STORAGE.name, name);
  return { id, secret, name };
}

export default function RadarApp() {
  const [identity, setIdentity] = useState<{ id: string; secret: string; name: string } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [tent, setTent] = useState<Tent | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [heading, setHeading] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [ip, setIp] = useState("detectando…");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<"radar" | "map">("radar");
  const [compassNeedsPermission, setCompassNeedsPermission] = useState(false);
  const latestRef = useRef({ position, heading, identity });
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { latestRef.current = { position, heading, identity }; }, [position, heading, identity]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  useEffect(() => {
    const found = getIdentity();
    setIdentity(found);
    setNameDraft(found.name);
    try {
      const savedTent = localStorage.getItem(STORAGE.tent);
      const savedFriends = localStorage.getItem(STORAGE.friends);
      if (savedTent) { const parsed = JSON.parse(savedTent); setTent(parsed); setTargetId("tent"); }
      if (savedFriends) setFriends(JSON.parse(savedFriends));
    } catch { /* cache corrompido é ignorado */ }
    setOnline(navigator.onLine);
    const onOnline = () => { setOnline(true); showNotice("Conexão recuperada. Sincronizando…"); };
    const onOffline = () => { setOnline(false); showNotice("Sem sinal. O radar local continua ativo."); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [showNotice]);

  useEffect(() => {
    if (!("geolocation" in navigator)) { setGpsError("Este celular não oferece GPS pelo navegador."); return; }
    const watch = navigator.geolocation.watchPosition(
      (result) => {
        setPosition({ lat: result.coords.latitude, lng: result.coords.longitude, accuracy: result.coords.accuracy, heading: result.coords.heading });
        setGpsError(null);
      },
      (error) => setGpsError(error.code === 1 ? "Libere a localização para usar o radar." : "Buscando sinal GPS…"),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const orientationHandler = useCallback((event: DeviceOrientationEvent) => {
    const iosHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    const value = typeof iosHeading === "number" ? iosHeading : event.alpha != null ? (360 - event.alpha) % 360 : null;
    if (value != null) setHeading(value);
  }, []);

  useEffect(() => {
    const Orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
    if (typeof Orientation !== "undefined" && typeof Orientation.requestPermission === "function") setCompassNeedsPermission(true);
    else window.addEventListener("deviceorientationabsolute", orientationHandler as EventListener, true);
    return () => window.removeEventListener("deviceorientationabsolute", orientationHandler as EventListener, true);
  }, [orientationHandler]);

  const enableCompass = async () => {
    try {
      const Orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
      const allowed = await Orientation.requestPermission?.();
      if (allowed === "granted") { window.addEventListener("deviceorientation", orientationHandler, true); setCompassNeedsPermission(false); showNotice("Bússola ativada"); }
    } catch { showNotice("Não foi possível ativar a bússola."); }
  };

  const sync = useCallback(async (endpoint = "/api/ping", extra: Record<string, unknown> = {}) => {
    const current = latestRef.current;
    if (!current.identity || !navigator.onLine) return null;
    setSyncing(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: current.identity.id, deviceSecret: current.identity.secret, name: current.identity.name,
          lat: current.position?.lat ?? null, lng: current.position?.lng ?? null,
          accuracy: current.position?.accuracy ?? null, heading: current.heading, ...extra
        })
      });
      const data = await response.json() as SyncResponse;
      if (!response.ok || !data.success) throw new Error(data.error || "Falha ao sincronizar");
      if (data.clientIp) setIp(data.clientIp);
      if (data.friends) { setFriends(data.friends); localStorage.setItem(STORAGE.friends, JSON.stringify(data.friends)); }
      if (data.myTent) { setTent(data.myTent); localStorage.setItem(STORAGE.tent, JSON.stringify(data.myTent)); }
      return data;
    } catch { setOnline(false); return null; }
    finally { setSyncing(false); }
  }, []);

  useEffect(() => {
    if (!identity) return;
    sync();
    const timer = setInterval(() => sync(), 7000);
    return () => clearInterval(timer);
  }, [identity, sync]);

  const fixTent = async () => {
    if (!position) { showNotice("Aguardando coordenada GPS. Fique em área aberta."); return; }
    const localTent = { lat: position.lat, lng: position.lng, accuracy: position.accuracy, savedAt: Date.now() };
    setTent(localTent); setTargetId("tent"); localStorage.setItem(STORAGE.tent, JSON.stringify(localTent));
    if (online) await sync("/api/tent");
    showNotice(online ? "Barraca fixada e sincronizada!" : "Barraca salva neste celular. Sincronizaremos ao voltar o sinal.");
  };

  const saveName = () => {
    const clean = nameDraft.trim().slice(0, 40);
    if (!clean || !identity) return;
    const next = { ...identity, name: clean };
    setIdentity(next); localStorage.setItem(STORAGE.name, clean); setEditingName(false); latestRef.current.identity = next;
    sync();
  };

  const target = useMemo<Target | null>(() => {
    if (targetId === "tent" && tent) return { id: "tent", name: "Minha barraca", type: "tent", coords: tent };
    const friend = friends.find((item) => item.id === targetId);
    return friend ? { id: friend.id, name: friend.name, type: "friend", coords: friend } : null;
  }, [targetId, tent, friends]);

  const navigation = useMemo(() => {
    if (!position || !target) return { distance: null, bearing: 0, angle: 0, direction: "SELECIONE UM ALVO" };
    const bearing = calculateBearing(position, target.coords);
    const angle = relativeAngle(bearing, heading);
    return { distance: calculateDistance(position, target.coords), bearing, angle, direction: humanDirection(angle) };
  }, [position, target, heading]);

  const sortedFriends = useMemo(() => friends.map((friend) => ({ ...friend, distance: position ? calculateDistance(position, friend) : null })).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)), [friends, position]);

  return (
    <main className="app-shell">
      <div className="aurora" aria-hidden="true" />
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><div><b>EARTHDANCE</b><span>RADAR · RS 2026</span></div></div>
        <div className={`connection ${online ? "online" : "offline"}`}>{online ? <Wifi size={15} /> : <WifiOff size={15} />}<span>{online ? "ONLINE" : "OFFLINE"}</span>{syncing && <RefreshCw size={13} className="spin" />}</div>
      </header>

      <section className="identity-row">
        <button className="profile" onClick={() => setEditingName(true)} aria-label="Editar seu nome">
          <span className="avatar">⚡</span><span><small>VOCÊ</small><strong>{identity?.name || "Preparando…"}</strong></span><Pencil size={15} />
        </button>
        <div className="sensor-pills">
          <span><Satellite size={14} />{position ? `±${Math.round(position.accuracy)}m` : "GPS…"}</span>
          <span><Radio size={14} />{online ? ip : "cache"}</span>
        </div>
      </section>

      {gpsError && <button className="warning" onClick={() => navigator.geolocation.getCurrentPosition(() => location.reload(), () => undefined)}><BellRing size={17} />{gpsError}<span>Tentar</span></button>}
      {compassNeedsPermission && <button className="compass-permission" onClick={enableCompass}><Compass size={18} /> Ativar bússola do celular</button>}

      <nav className="view-tabs" aria-label="Visualização">
        <button className={view === "radar" ? "active" : ""} onClick={() => setView("radar")}><Compass size={18} />Radar</button>
        <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}><Map size={18} />Mapa</button>
      </nav>

      {view === "radar" ? (
        <section className="radar-section">
          <div className="target-label"><span>{target?.type === "tent" ? "⛺" : "●"}</span><div><small>APONTANDO PARA</small><strong>{target?.name || "Escolha sua barraca ou alguém"}</strong></div></div>
          <div className="radar-wrap">
            <div className="radar-sweep" />
            <div className="radar-grid"><span className="north">N</span><span className="east">L</span><span className="south">S</span><span className="west">O</span></div>
            <div className="arrow" style={{ transform: `translate(-50%, -52%) rotate(${navigation.angle}deg)` }}><Navigation fill="currentColor" strokeWidth={1.5} /></div>
            <div className="radar-center" />
          </div>
          <div className="distance-readout"><strong>{formatDistance(navigation.distance)}</strong><span>{navigation.direction}</span></div>
        </section>
      ) : (
        <section className="map-section">
          <MapView me={position} tent={tent} friends={friends} selectedId={targetId} onSelect={(id) => { setTargetId(id); showNotice(id === "tent" ? "Mirando na sua barraca" : "Pessoa selecionada"); }} />
          <div className="map-legend"><span><i className="me-dot" />Você</span><span>⛺ Barraca</span><span><i />Pessoas</span></div>
        </section>
      )}

      <section className="primary-actions">
        <button className="fix-tent" onClick={fixTent}><TentTree size={24} /><span><strong>{tent ? "ATUALIZAR MINHA BARRACA" : "FIXAR MINHA BARRACA AQUI"}</strong><small>Salva o ponto exato deste local</small></span></button>
        <button className="aim-tent" onClick={() => { if (tent) { setTargetId("tent"); setView("radar"); } else showNotice("Primeiro fixe sua barraca."); }} disabled={!tent}><Navigation size={21} /><span>MIRAR NA MINHA BARRACA</span></button>
      </section>

      <section className="friends-section">
        <div className="section-title"><div><Users size={19} /><strong>PESSOAS PRÓXIMAS</strong></div><span>{friends.length} online</span></div>
        <div className="friend-list">
          {sortedFriends.length ? sortedFriends.map((friend) => (
            <button key={friend.id} className={`friend-card ${targetId === friend.id ? "selected" : ""}`} onClick={() => { setTargetId(friend.id); setView("radar"); }}>
              <span className="friend-avatar">{friend.name.charAt(0).toUpperCase()}</span>
              <span className="friend-info"><strong>{friend.name}</strong><small>visto agora · precisão ±{Math.round(friend.accuracy || 0)}m</small></span>
              <span className="friend-distance">{formatDistance(friend.distance)}<Navigation size={15} /></span>
            </button>
          )) : <div className="empty-friends"><Radio size={24} /><span>Ninguém apareceu por perto ainda.</span><small>Quando outras pessoas abrirem o app, elas surgirão aqui automaticamente.</small></div>}
        </div>
      </section>

      <footer><span>O CORAÇÃO É A BATIDA DA HUMANIDADE</span><small>GPS ativo mesmo com sinal oscilante</small></footer>

      {editingName && <div className="modal-backdrop" onClick={() => setEditingName(false)}><div className="name-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setEditingName(false)}><X /></button><span className="modal-icon">⚡</span><h2>Como devemos chamar você?</h2><p>Esse nome aparece para quem estiver usando o radar no evento.</p><input autoFocus value={nameDraft} maxLength={40} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} /><button className="save-name" onClick={saveName}>SALVAR NOME</button></div></div>}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
