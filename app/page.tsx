"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Compass,
  Copy,
  ExternalLink,
  HeartPulse,
  Info,
  LocateFixed,
  Map,
  MapPin,
  Navigation,
  Radio,
  Share2,
  Tent,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  ageLabel,
  bearing,
  direction,
  distance,
  formatDistance,
  normalizeDegrees,
  Point,
  relativePoint,
} from "../lib/geo";

type Tab = "radar" | "people" | "map" | "event";
type Group = { id: string; name: string; join_code: string; owner_id: string };
type Peer = {
  user_id: string;
  nickname: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  heading: number | null;
  updated_at: string | null;
};
type Position = Point & { accuracy?: number };
type Destination = { id: string; label: string; kind: "person" | "tent" | "venue"; point: Point; updated_at?: string | null };
type DeviceOrientationPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const EVENT = {
  name: "Earthdance RS 2026",
  venue: "CTG João Sobrinho",
  city: "Capão da Canoa, RS",
  dates: "25 a 27 de setembro de 2026",
  camping: "Camping: sex. 25/set 10h → seg. 28/set 14h",
  prayer: "Prayer for Peace: sábado, 26/set, às 20h",
  theme: "O Coração é a Batida da Humanidade",
  point: { latitude: -29.7029161, longitude: -50.0201672 },
};

const LOCAL_GROUP = "earthdance-radar-group";
const LOCAL_TENT = "earthdance-radar-tent";
const LOCAL_SNAPSHOT = "earthdance-radar-snapshot";

export default function Home() {
  const [tab, setTab] = useState<Tab>("radar");
  const [userId, setUserId] = useState("");
  const [nickname, setNickname] = useState("");
  const [draft, setDraft] = useState("");
  const [group, setGroup] = useState<Group | null>(null);
  const [groupName, setGroupName] = useState("Meu acampamento");
  const [code, setCode] = useState("");
  const [me, setMe] = useState<Position | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [tent, setTent] = useState<Position | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [compassPermissionNeeded, setCompassPermissionNeeded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(true);
  const lastLocationWrite = useRef(0);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    try {
      const storedTent = localStorage.getItem(LOCAL_TENT);
      if (storedTent) setTent(JSON.parse(storedTent));
      const storedSnapshot = localStorage.getItem(LOCAL_SNAPSHOT);
      if (storedSnapshot) setPeers(JSON.parse(storedSnapshot));
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const result = await supabase.auth.signInAnonymously();
        session = result.data.session;
        if (result.error) {
          setError("O acesso anônimo do projeto ainda precisa ser habilitado no Supabase para o app funcionar.");
          return;
        }
      }
      if (!session) return;
      setUserId(session.user.id);

      const [{ data: profile }, { data: places }, { data: groups }] = await Promise.all([
        supabase.from("profiles").select("nickname").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("saved_places").select("latitude,longitude,accuracy").eq("user_id", session.user.id).eq("kind", "tent").maybeSingle(),
        supabase.rpc("my_groups"),
      ]);

      if (profile?.nickname) setNickname(profile.nickname);
      if (places) {
        const saved = places as Position;
        setTent(saved);
        localStorage.setItem(LOCAL_TENT, JSON.stringify(saved));
      }

      const remembered = localStorage.getItem(LOCAL_GROUP);
      const list = (groups || []) as Group[];
      const restored = list.find(g => g.id === remembered) || list[0];
      if (restored) {
        setGroup(restored);
        localStorage.setItem(LOCAL_GROUP, restored.id);
      }
    })();
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Este aparelho não oferece GPS pelo navegador.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        setMe({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      err => {
        if (err.code === 1) setError("Permita o acesso à localização para usar o radar.");
        else setError("Não conseguimos obter sua localização agora.");
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const attachCompass = useCallback(() => {
    const handler = (event: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const raw =
        typeof event.webkitCompassHeading === "number"
          ? event.webkitCompassHeading
          : typeof event.alpha === "number"
            ? 360 - event.alpha
            : null;
      if (raw !== null) setHeading(normalizeDegrees(raw));
    };
    window.addEventListener("deviceorientation", handler as EventListener, true);
    return () => window.removeEventListener("deviceorientation", handler as EventListener, true);
  }, []);

  useEffect(() => {
    const Orientation = DeviceOrientationEvent as DeviceOrientationPermission;
    if (typeof Orientation.requestPermission === "function") {
      setCompassPermissionNeeded(true);
      return;
    }
    return attachCompass();
  }, [attachCompass]);

  async function enableCompass() {
    try {
      const Orientation = DeviceOrientationEvent as DeviceOrientationPermission;
      if (typeof Orientation.requestPermission === "function") {
        const result = await Orientation.requestPermission();
        if (result !== "granted") {
          setError("A bússola foi bloqueada. O app continuará mostrando distância e direção cardinal.");
          return;
        }
      }
      setCompassPermissionNeeded(false);
      attachCompass();
      flash("Bússola ativada");
    } catch {
      setError("Não foi possível ativar a bússola neste aparelho.");
    }
  }

  useEffect(() => {
    if (!userId || !me || !online) return;
    const now = Date.now();
    if (now - lastLocationWrite.current < 12000) return;
    lastLocationWrite.current = now;
    supabase
      .from("last_locations")
      .upsert({
        user_id: userId,
        latitude: me.latitude,
        longitude: me.longitude,
        accuracy: me.accuracy ?? null,
        heading,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) setError("Não conseguimos atualizar sua localização no grupo.");
      });
  }, [userId, me, heading, online]);

  const loadPeers = useCallback(async () => {
    if (!group || !userId || !online) return;
    const { data, error } = await supabase.rpc("group_snapshot", { p_group: group.id });
    if (error) {
      setError("Não conseguimos sincronizar seu grupo.");
      return;
    }
    const list = ((data || []) as Peer[]).filter(p => p.user_id !== userId);
    setPeers(list);
    localStorage.setItem(LOCAL_SNAPSHOT, JSON.stringify(list));
  }, [group, userId, online]);

  useEffect(() => {
    if (!group) return;
    loadPeers();
    const timer = window.setInterval(loadPeers, 5000);
    return () => window.clearInterval(timer);
  }, [group, loadPeers]);

  const nav = useMemo(() => {
    if (!me || !destination) return null;
    const d = distance(me, destination.point);
    const b = bearing(me, destination.point);
    const relative = heading === null ? 0 : normalizeDegrees(b - heading);
    return { d, b, relative };
  }, [me, destination, heading]);

  async function saveName() {
    const clean = draft.trim();
    if (!userId) return setError("Ainda estamos preparando sua sessão.");
    if (clean.length < 2) return setError("Use um nome com pelo menos 2 caracteres.");
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: userId, nickname: clean, updated_at: new Date().toISOString() });
    if (error) return setError("Não conseguimos salvar seu nome.");
    setNickname(clean);
    setError("");
  }

  async function createGroup() {
    setError("");
    const clean = groupName.trim();
    if (clean.length < 2) return setError("Dê um nome ao seu grupo.");
    const { data, error } = await supabase.rpc("create_group", { p_name: clean });
    if (error || !data) return setError("Não conseguimos criar o grupo.");
    const created = data as Group;
    setGroup(created);
    localStorage.setItem(LOCAL_GROUP, created.id);
    flash("Grupo criado");
  }

  async function joinGroup() {
    setError("");
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) return setError("O código do grupo tem 6 caracteres.");
    const { data, error } = await supabase.rpc("join_group", { p_code: clean });
    if (error || !data) return setError("Código não encontrado.");
    const joined = data as Group;
    setGroup(joined);
    localStorage.setItem(LOCAL_GROUP, joined.id);
    flash("Você entrou no grupo");
  }

  async function shareGroup() {
    if (!group) return;
    const text = `Entra no meu grupo no EarthDance Radar. Código: ${group.join_code}`;
    try {
      if (navigator.share) await navigator.share({ title: "EarthDance Radar", text });
      else {
        await navigator.clipboard.writeText(group.join_code);
        flash("Código copiado");
      }
    } catch {}
  }

  async function copyCode() {
    if (!group) return;
    await navigator.clipboard.writeText(group.join_code);
    flash("Código copiado");
  }

  async function markTent() {
    if (!me) return setError("Aguardando um sinal de GPS válido.");
    setError("");
    const saved: Position = { ...me };
    localStorage.setItem(LOCAL_TENT, JSON.stringify(saved));
    setTent(saved);
    if (online && userId) {
      await supabase.from("saved_places").delete().eq("user_id", userId).eq("kind", "tent");
      const { error } = await supabase.from("saved_places").insert({
        user_id: userId,
        kind: "tent",
        label: "Minha barraca",
        latitude: me.latitude,
        longitude: me.longitude,
        accuracy: me.accuracy ?? null,
      });
      if (error) setError("A barraca ficou salva neste aparelho, mas não sincronizou com a nuvem.");
    }
    setDestination({ id: "tent", label: "Minha barraca", kind: "tent", point: saved });
    setTab("radar");
    flash("Barraca marcada");
  }

  function navigateToPeer(peer: Peer) {
    if (peer.latitude === null || peer.longitude === null) {
      return setError("Essa pessoa ainda não compartilhou uma localização.");
    }
    setDestination({
      id: peer.user_id,
      label: peer.nickname,
      kind: "person",
      point: { latitude: peer.latitude, longitude: peer.longitude },
      updated_at: peer.updated_at,
    });
    setTab("radar");
  }

  function navigateToTent() {
    if (!tent) return markTent();
    setDestination({ id: "tent", label: "Minha barraca", kind: "tent", point: tent });
    setTab("radar");
  }

  function navigateToVenue() {
    setDestination({ id: "venue", label: EVENT.venue, kind: "venue", point: EVENT.point });
    setTab("radar");
  }

  const onlinePeers = peers.filter(
    p => p.updated_at && Date.now() - new Date(p.updated_at).getTime() < 45000
  ).length;

  if (!nickname) {
    return (
      <main className="shell">
        <header className="brandbar">
          <div className="mark"><Radio size={18} /></div>
          <div><b>EarthDance Radar</b><small>projeto independente · RS 2026</small></div>
        </header>
        <section className="onboarding">
          <span className="kicker">25–27 SET · CAPÃO DA CANOA</span>
          <h1>Encontre quem importa.<br /><em>Volte para onde é seu.</em></h1>
          <p>Um radar simples para achar sua galera, sua barraca e o ponto do festival sem trocar localização o tempo todo.</p>
        </section>
        <section className="panel">
          <label className="label">Como sua galera te chama?</label>
          <input
            className="input"
            autoComplete="nickname"
            maxLength={24}
            placeholder="Seu nome ou apelido"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveName()}
          />
          <button className="primary wide" onClick={saveName}>Entrar no radar <ArrowUp size={18} /></button>
          <p className="micro">Sem e-mail e sem senha. Sua sessão fica neste aparelho.</p>
        </section>
        {error && <div className="toast errorToast">{error}</div>}
      </main>
    );
  }

  if (!group) {
    return (
      <main className="shell">
        <TopBar online={online} gps={!!me} />
        <section className="welcome">
          <span className="kicker">OLÁ, {nickname.toUpperCase()}</span>
          <h1>Sua galera,<br />no mesmo pulso.</h1>
          <p>Crie um grupo privado para o acampamento ou entre com o código de alguém.</p>
        </section>

        <section className="panel">
          <div className="panelIcon"><Users size={20} /></div>
          <h2>Criar meu grupo</h2>
          <input
            className="input"
            maxLength={40}
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
          />
          <button className="primary wide" onClick={createGroup}>Criar grupo</button>
        </section>

        <div className="or"><span>ou</span></div>

        <section className="panel">
          <label className="label">Código de 6 caracteres</label>
          <input
            className="input codeInput"
            maxLength={6}
            placeholder="ABC123"
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
          />
          <button className="secondary wide" onClick={joinGroup}>Entrar no grupo</button>
        </section>
        {error && <div className="toast errorToast">{error}</div>}
      </main>
    );
  }

  return (
    <main className="shell appShell">
      <TopBar online={online} gps={!!me} />

      <div className="groupStrip">
        <div>
          <span className="kicker">SEU GRUPO</span>
          <strong>{group.name}</strong>
        </div>
        <div className="groupCode">
          <button onClick={copyCode} aria-label="Copiar código">{group.join_code} <Copy size={14} /></button>
          <button className="iconButton" onClick={shareGroup} aria-label="Compartilhar grupo"><Share2 size={17} /></button>
        </div>
      </div>

      {tab === "radar" && (
        <>
          <section className="radarHero">
            <div className="targetLine">
              <span className="kicker">{destination ? "NAVEGANDO PARA" : "RADAR PRONTO"}</span>
              <strong>{destination?.label || "Escolha um destino"}</strong>
              {destination?.updated_at && <small>{ageLabel(destination.updated_at)}</small>}
            </div>

            <div className="radar">
              <div className="sweep" />
              <div className="ring r1" /><div className="ring r2" /><div className="cross x" /><div className="cross y" />
              <div className="north">N</div>
              <div className="arrowCore">
                <Navigation
                  size={58}
                  strokeWidth={1.7}
                  style={{ transform: `rotate(${nav && heading !== null ? nav.relative : 0}deg)` }}
                />
              </div>
            </div>

            {nav ? (
              <div className="distanceBlock">
                <div className="distance">{formatDistance(nav.d)}</div>
                <div className="direction">
                  {heading === null ? `Direção ${direction(nav.b)} · ${Math.round(nav.b)}°` : "aponte o topo do celular para frente"}
                </div>
                <div className="accuracy">{me?.accuracy ? `precisão do GPS ±${Math.round(me.accuracy)} m` : "calculando precisão…"}</div>
              </div>
            ) : (
              <div className="distanceBlock">
                <div className="emptyTitle">Quem você quer encontrar?</div>
                <p className="muted">Abra Pessoas para seguir alguém ou use sua barraca como destino.</p>
              </div>
            )}

            {compassPermissionNeeded && (
              <button className="compassCallout" onClick={enableCompass}>
                <Compass size={18} /> Ativar bússola para seta em tempo real
              </button>
            )}
          </section>

          <section className="quickGrid">
            <button className="quick" onClick={() => setTab("people")}>
              <span><Users size={19} /></span>
              <b>{onlinePeers} online</b>
              <small>Encontrar pessoas</small>
            </button>
            <button className="quick" onClick={navigateToTent}>
              <span><Tent size={19} /></span>
              <b>{tent ? "Barraca salva" : "Marcar barraca"}</b>
              <small>{tent ? "Navegar de volta" : "Salvar este ponto"}</small>
            </button>
          </section>
        </>
      )}

      {tab === "people" && (
        <section className="pageSection">
          <span className="kicker">GRUPO {group.join_code}</span>
          <h1>Pessoas</h1>
          <p className="muted">A posição é aproximada e depende do GPS e da conexão de cada aparelho.</p>

          <div className="peopleList">
            {peers.length === 0 ? (
              <div className="emptyCard">
                <Users size={28} />
                <h3>Você chegou primeiro.</h3>
                <p>Compartilhe o código <b>{group.join_code}</b> para sua galera entrar.</p>
                <button className="secondary" onClick={shareGroup}><Share2 size={16} /> Compartilhar</button>
              </div>
            ) : peers.map(peer => {
              const hasPoint = peer.latitude !== null && peer.longitude !== null;
              const d = me && hasPoint ? distance(me, { latitude: peer.latitude!, longitude: peer.longitude! }) : null;
              const fresh = !!peer.updated_at && Date.now() - new Date(peer.updated_at).getTime() < 45000;
              return (
                <button className="personCard" key={peer.user_id} onClick={() => navigateToPeer(peer)}>
                  <div className={fresh ? "avatar liveAvatar" : "avatar"}>{peer.nickname.slice(0, 1).toUpperCase()}</div>
                  <div className="personText">
                    <div><b>{peer.nickname}</b><span className={fresh ? "status liveStatus" : "status"}>{fresh ? "online" : ageLabel(peer.updated_at)}</span></div>
                    <small>{d !== null ? `${formatDistance(d)} de você` : "aguardando localização"}</small>
                  </div>
                  <Navigation size={19} />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {tab === "map" && (
        <section className="pageSection">
          <span className="kicker">VISÃO DE CAMPO</span>
          <h1>Mapa próximo</h1>
          <p className="muted">Uma visão relativa que funciona sem mapas pagos. O centro é você e o círculo representa até 800 m.</p>
          <div className="fieldMap">
            <div className="mapRing m1" /><div className="mapRing m2" /><div className="mapCross mx" /><div className="mapCross my" />
            <div className="youDot"><LocateFixed size={19} /></div>
            {me && tent && <MapDot origin={me} point={tent} label="Barraca" kind="tent" />}
            {me && <MapDot origin={me} point={EVENT.point} label="CTG" kind="venue" />}
            {me && peers.filter(p => p.latitude !== null && p.longitude !== null).map(p => (
              <MapDot
                key={p.user_id}
                origin={me}
                point={{ latitude: p.latitude!, longitude: p.longitude! }}
                label={p.nickname}
                kind="person"
              />
            ))}
          </div>
          <div className="legend"><span>● você</span><span>▲ pessoas</span><span>■ barraca</span><span>◆ CTG</span></div>
          <button className="secondary wide" onClick={navigateToVenue}><MapPin size={17} /> Navegar até o CTG João Sobrinho</button>
        </section>
      )}

      {tab === "event" && (
        <section className="pageSection">
          <span className="kicker">EARTHDANCE RS 2026</span>
          <h1>{EVENT.theme}</h1>
          <div className="eventCard heartCard">
            <HeartPulse size={22} />
            <div><b>{EVENT.dates}</b><small>{EVENT.venue} · {EVENT.city}</small></div>
          </div>
          <div className="eventCard"><Tent size={21} /><div><b>Camping incluído no evento</b><small>{EVENT.camping}</small></div></div>
          <div className="eventCard"><Radio size={21} /><div><b>Prayer for Peace</b><small>{EVENT.prayer}</small></div></div>
          <div className="eventCard"><Info size={21} /><div><b>Espaços divulgados</b><small>Mainfloor Global Peace Party, Chillout/EarthStage, Feira Mix, Cyber Crew, NatuFlora, Dragonica, Cine, Espaço Kids e Praça de Alimentação.</small></div></div>
          <button className="primary wide" onClick={navigateToVenue}><Navigation size={17} /> Navegar para o local</button>
          <a className="secondary wide linkButton" href="https://www.earthdance.com.br" target="_blank" rel="noreferrer">
            Site oficial <ExternalLink size={16} />
          </a>
          <p className="micro disclaimer">EarthDance Radar é uma ferramenta independente de localização e não representa a organização oficial do festival.</p>
        </section>
      )}

      <nav className="bottomNav">
        <button className={tab === "radar" ? "active" : ""} onClick={() => setTab("radar")}><Navigation size={19} /><span>Radar</span></button>
        <button className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}><Users size={19} /><span>Pessoas</span></button>
        <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}><Map size={19} /><span>Mapa</span></button>
        <button className={tab === "event" ? "active" : ""} onClick={() => setTab("event")}><Info size={19} /><span>Evento</span></button>
      </nav>

      {!online && <div className="offlineBar">Sem internet · exibindo os últimos dados salvos</div>}
      {notice && <div className="toast">{notice}</div>}
      {error && <div className="toast errorToast" onClick={() => setError("")}>{error}</div>}
    </main>
  );
}

function TopBar({ online, gps }: { online: boolean; gps: boolean }) {
  return (
    <header className="brandbar">
      <div className="mark"><Radio size={18} /></div>
      <div><b>EarthDance Radar</b><small>Capão da Canoa · 2026</small></div>
      <div className="signals">
        <span className={online ? "signal on" : "signal"}>{online ? "online" : "offline"}</span>
        <span className={gps ? "signal on" : "signal"}>{gps ? "GPS" : "GPS…"}</span>
      </div>
    </header>
  );
}

function MapDot({ origin, point, label, kind }: { origin: Point; point: Point; label: string; kind: "person" | "tent" | "venue" }) {
  const pos = relativePoint(origin, point, 122);
  return (
    <div
      className={`mapDot ${kind}`}
      style={{ transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
      title={`${label} · ${formatDistance(pos.d)}`}
    >
      <span>{label.slice(0, 8)}</span>
    </div>
  );
}
