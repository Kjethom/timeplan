import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ---------- paletttokens ---------- */
const C = {
  paper: "#EDF0EF",
  surface: "#FFFFFF",
  ink: "#16232B",
  muted: "#5D6E77",
  faint: "#93A2A9",
  rule: "#D5DDDB",
  plan: "#8FA0AB",
  actual: "#12615C",
  actualFill: "rgba(18, 97, 92, 0.10)",
  behind: "#9E4038",
  ahead: "#2E6B4F",
  now: "#B98B1D",
};

const STORAGE_KEY = "timeplan-prosjektoppgave-v1";

/* ---------- sikkerhetskopi til privat GitHub Gist ---------- */
const TOKEN_KEY = "timeplan-gist-token";
const GIST_KEY = "timeplan-gist-id";
const GIST_FILE = "timeplan.json";

const readLocal = (k) => {
  try {
    return localStorage.getItem(k) || "";
  } catch (e) {
    return "";
  }
};
const writeLocal = (k, v) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch (e) {
    /* lagring utilgjengelig */
  }
};

async function ghFetch(path, token, options) {
  const res = await fetch("https://api.github.com" + path, {
    ...(options || {}),
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
  });
  if (res.status === 401)
    throw new Error("Tokenet ble avvist. Sjekk at det er gyldig og har gist-tilgang.");
  if (res.status === 403)
    throw new Error("GitHub avviste forespørselen. Mangler tokenet gist-tilgang?");
  if (res.status === 404)
    throw new Error("Fant ikke gisten. Koble fra og til igjen for å lage en ny.");
  if (!res.ok) throw new Error("GitHub svarte " + res.status + ".");
  return res.json();
}

async function finnGist(token) {
  const liste = await ghFetch("/gists?per_page=100", token);
  const treff = (liste || []).filter((g) => g.files && g.files[GIST_FILE]);
  treff.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return { id: treff.length ? treff[0].id : "", antall: treff.length };
}

async function pullGist(token, gistId) {
  const g = await ghFetch("/gists/" + gistId, token);
  const f = g.files && g.files[GIST_FILE];
  if (!f) throw new Error("Gisten mangler filen " + GIST_FILE + ".");
  const raw = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  return JSON.parse(raw);
}

async function pushGist(token, gistId, payload) {
  const body = JSON.stringify({
    description: "Timeregnskap for prosjektoppgaven",
    public: false,
    files: { [GIST_FILE]: { content: JSON.stringify(payload, null, 2) } },
  });
  const g = gistId
    ? await ghFetch("/gists/" + gistId, token, { method: "PATCH", body })
    : await ghFetch("/gists", token, { method: "POST", body });
  return g.id;
}

const STATUSER = ["ny", "pagar", "ferdig"];
const STATUS_TEKST = { ny: "Ikke start", pagar: "Pågår", ferdig: "Ferdig" };

function StatusIkon({ status }) {
  if (status === "ferdig")
    return (
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="5.5" fill="none" stroke={C.ahead} strokeWidth="1.4" />
        <path d="M 3.8 6.6 L 5.6 8.4 L 9.2 4.6" fill="none" stroke={C.ahead}
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (status === "pagar")
    return (
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="5.5" fill="none" stroke={C.now} strokeWidth="1.4" />
        <path d="M 6.5 1 A 5.5 5.5 0 0 1 6.5 12 Z" fill={C.now} />
      </svg>
    );
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5.5" fill="none" stroke={C.faint}
              strokeWidth="1.4" strokeDasharray="2 2" />
    </svg>
  );
}

const klokke = () =>
  new Date().toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });

const DEFAULT_CONFIG = {
  start: "2026-08-24",
  end: "2026-12-18",
  total: 200,
  midpoint: 0.55,
  steep: 5,
};

/* ---------- hjelpefunksjoner ---------- */
const d2s = (d) => d.toISOString().slice(0, 10);
const s2d = (s) => {
  const [y, m, dd] = String(s).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, dd || 1));
};
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const mondayOf = (d) => addDays(d, 1 - (d.getUTCDay() || 7));

function isoWeek(d) {
  const t = new Date(d.getTime());
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - ys) / 86400000 + 1) / 7);
}

const fmtDay = (d) => `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
const half = (x) => Math.round(x * 2) / 2;
const nf = (x) =>
  (Math.round(x * 10) / 10).toLocaleString("nb-NO", {
    maximumFractionDigits: 1,
  });
const signed = (x) => (x >= 0 ? "+" : "−") + nf(Math.abs(x));

const parseNum = (s) => {
  if (s === undefined || s === null || String(s).trim() === "") return null;
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Normalisert logistisk kurve: F(0)=0, F(1)=1 */
function sCurve(t, m, k) {
  const L = (x) => 1 / (1 + Math.exp(-k * (x - m)));
  const a = L(0);
  const b = L(1);
  return (L(t) - a) / (b - a);
}

/* ---------- små byggeklosser ---------- */
function Stat({ label, value, unit, tone }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: C.muted }}>
        {label}
      </span>
      <span
        className="text-2xl"
        style={{
          color: tone || C.ink,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
        {unit && (
          <span className="text-sm ml-1" style={{ color: C.faint }}>
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

function NumCell({ value, placeholder, onChange, emphasis }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-16 py-1 px-2 text-right rounded outline-none focus:ring-2"
      style={{
        border: `1px solid ${emphasis ? C.actual : C.rule}`,
        background: emphasis ? "rgba(18,97,92,0.05)" : C.surface,
        color: C.ink,
        fontVariantNumeric: "tabular-nums",
      }}
    />
  );
}

function MilestoneDot(props) {
  const { cx, cy, payload } = props;
  if (!payload || !payload.milestone || cx == null || cy == null)
    return <g />;
  return (
    <path
      d={`M ${cx} ${cy - 5.5} L ${cx + 5.5} ${cy} L ${cx} ${cy + 5.5} L ${
        cx - 5.5
      } ${cy} Z`}
      fill={C.surface}
      stroke={C.now}
      strokeWidth={1.8}
    />
  );
}

/* ---------- hovedkomponent ---------- */
export default function Timeplan() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [planOverrides, setPlanOverrides] = useState({});
  const [actuals, setActuals] = useState({});
  const [topics, setTopics] = useState({});
  const [milestones, setMilestones] = useState({});
  const [statuses, setStatuses] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("Laster …");
  const [showSettings, setShowSettings] = useState(false);
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [sync, setSync] = useState({ state: "av", msg: "" });
  const gistIdRef = useRef("");
  const lastSyncedRef = useRef("");
  const conflictRef = useRef(false);
  const [gistId, setGistIdVis] = useState("");
  const [conflict, setConflict] = useState(null);

  const settGist = (id) => {
    gistIdRef.current = id;
    setGistIdVis(id);
    writeLocal(GIST_KEY, id);
  };

  const applyPayload = (s) => {
    if (!s) return;
    if (s.config) setConfig({ ...DEFAULT_CONFIG, ...s.config });
    setPlanOverrides(s.planOverrides || {});
    setActuals(s.actuals || {});
    setTopics(s.topics || {});
    setMilestones(s.milestones || {});
    setStatuses(s.statuses || {});
  };

  /* last lagret tilstand, og hent nyere sikkerhetskopi hvis den finnes */
  useEffect(() => {
    let alive = true;
    (async () => {
      let local = null;
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r && r.value) local = JSON.parse(r.value);
      } catch (e) {
        /* ingen lokal tilstand ennå */
      }

      const t = readLocal(TOKEN_KEY);
      let gid = readLocal(GIST_KEY);

      if (t && !gid) {
        try {
          gid = (await finnGist(t)).id;
        } catch (e) {
          /* uten nett fortsetter vi lokalt */
        }
      }
      gistIdRef.current = gid;
      if (alive) setGistIdVis(gid);
      if (gid) writeLocal(GIST_KEY, gid);

      let remote = null;
      if (t && gid) {
        if (alive) setSync({ state: "arbeider", msg: "Henter fra GitHub …" });
        try {
          remote = await pullGist(t, gid);
        } catch (e) {
          if (alive) setSync({ state: "feil", msg: e.message });
        }
      }
      if (!alive) return;

      const nyereUte =
        remote &&
        (!local ||
          !local.updatedAt ||
          String(remote.updatedAt || "") > String(local.updatedAt));
      applyPayload(nyereUte ? remote : local);

      lastSyncedRef.current = (remote && remote.updatedAt) || "";
      setToken(t);
      setTokenDraft(t);
      if (t && remote)
        setSync({
          state: "ok",
          msg: nyereUte
            ? "Hentet sikkerhetskopi fra GitHub"
            : "Lokal versjon er nyest",
        });
      else if (!t) setSync({ state: "av", msg: "" });

      setLoaded(true);
      setStatus("Lagres automatisk");
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* lagre ved endring: alltid lokalt, og til GitHub hvis tilkoblet */
  useEffect(() => {
    if (!loaded) return;
    setStatus("Lagrer …");
    const t = setTimeout(async () => {
      const payload = {
        updatedAt: new Date().toISOString(),
        config,
        planOverrides,
        actuals,
        topics,
        milestones,
        statuses,
      };
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(payload));
        setStatus("Lagret");
      } catch (e) {
        setStatus("Kunne ikke lagre lokalt. Prøv en endring til.");
      }
      if (!token || conflictRef.current) return;
      setSync({ state: "arbeider", msg: "Lagrer til GitHub …" });
      try {
        if (gistIdRef.current) {
          const ute = await pullGist(token, gistIdRef.current);
          const uteTid = String(ute.updatedAt || "");
          if (uteTid && uteTid > String(lastSyncedRef.current || "")) {
            conflictRef.current = true;
            setConflict({ remote: ute, when: uteTid });
            setSync({
              state: "feil",
              msg: "Endret på en annen enhet. Ikke lagret til GitHub.",
            });
            return;
          }
        }
        const id = await pushGist(token, gistIdRef.current, payload);
        if (id && id !== gistIdRef.current) settGist(id);
        lastSyncedRef.current = payload.updatedAt;
        setSync({ state: "ok", msg: "Sikkerhetskopiert " + klokke() });
      } catch (e) {
        setSync({ state: "feil", msg: e.message });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [config, planOverrides, actuals, topics, milestones, statuses, loaded, token]);

  const kobleTil = async () => {
    const t = tokenDraft.trim();
    if (!t) return;
    setSync({ state: "arbeider", msg: "Kobler til …" });
    try {
      const { id, antall } = await finnGist(t);
      if (id) {
        settGist(id);
        const remote = await pullGist(t, id);
        applyPayload(remote);
        lastSyncedRef.current = remote.updatedAt || "";
        setSync({
          state: antall > 1 ? "feil" : "ok",
          msg:
            antall > 1
              ? "Fant " +
                antall +
                " sikkerhetskopier og brukte den sist endrede. Slett de andre på gist.github.com."
              : "Fant eksisterende sikkerhetskopi og hentet timene",
        });
      } else {
        setSync({ state: "ok", msg: "Ingen sikkerhetskopi funnet. Oppretter en ny." });
      }
      writeLocal(TOKEN_KEY, t);
      setToken(t);
    } catch (e) {
      setSync({ state: "feil", msg: e.message });
    }
  };

  const kobleFra = () => {
    writeLocal(TOKEN_KEY, "");
    settGist("");
    setToken("");
    setTokenDraft("");
    setSync({ state: "av", msg: "" });
  };

  const brukEkstern = () => {
    if (!conflict) return;
    applyPayload(conflict.remote);
    lastSyncedRef.current = conflict.when;
    conflictRef.current = false;
    setConflict(null);
    setSync({ state: "ok", msg: "Hentet versjonen fra den andre enheten" });
  };

  const beholdMine = async () => {
    if (!conflict) return;
    conflictRef.current = false;
    setConflict(null);
    setSync({ state: "arbeider", msg: "Overskriver …" });
    const payload = {
      updatedAt: new Date().toISOString(),
      config,
      planOverrides,
      actuals,
      topics,
      milestones,
      statuses,
    };
    try {
      await pushGist(token, gistIdRef.current, payload);
      lastSyncedRef.current = payload.updatedAt;
      setSync({ state: "ok", msg: "Overskrev med dine timer " + klokke() });
    } catch (e) {
      setSync({ state: "feil", msg: e.message });
    }
  };

  const hentNa = async () => {
    if (!token || !gistIdRef.current) return;
    setSync({ state: "arbeider", msg: "Henter …" });
    try {
      const remote = await pullGist(token, gistIdRef.current);
      applyPayload(remote);
      lastSyncedRef.current = remote.updatedAt || "";
      conflictRef.current = false;
      setConflict(null);
      setSync({ state: "ok", msg: "Hentet fra GitHub " + klokke() });
    } catch (e) {
      setSync({ state: "feil", msg: e.message });
    }
  };

  const today = useMemo(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  }, []);

  /* ---------- beregning av uker ---------- */
  const model = useMemo(() => {
    const start = mondayOf(s2d(config.start));
    const end = s2d(config.end);
    const stamps = [];
    let cur = start;
    while (cur <= end && stamps.length < 80) {
      stamps.push(cur);
      cur = addDays(cur, 7);
    }
    if (stamps.length === 0) stamps.push(start);
    const N = stamps.length;
    const total = Math.max(0, parseNum(config.total) ?? 0);

    // Rund kumulativ plan til halve timer, slik at ukesummen alltid treffer totalen
    let prev = 0;
    const rows = stamps.map((ws, i) => {
      const key = d2s(ws);
      const cumR = half(total * sCurve((i + 1) / N, config.midpoint, config.steep));
      const auto = Math.max(0, half(cumR - prev));
      prev = cumR;
      const ov = parseNum(planOverrides[key]);
      const planned = ov === null ? auto : Math.max(0, ov);
      const act = parseNum(actuals[key]);
      return {
        key,
        i,
        ws,
        we: addDays(ws, 6),
        uke: isoWeek(ws),
        auto,
        planned,
        overridden: ov !== null,
        actual: act,
        topic: topics[key] || "",
        milestone: !!milestones[key],
        status: statuses[key] || "ny",
      };
    });

    let cp = 0;
    let ca = 0;
    rows.forEach((r) => {
      cp += r.planned;
      ca += r.actual || 0;
      r.cumPlan = cp;
      r.cumActual = ca;
    });

    // Hvor langt inn i planen er vi i dag?
    let nowIdx = -1;
    let planToDate = 0;
    if (today >= start) {
      const raw = Math.floor((today - start) / (7 * 86400000));
      nowIdx = Math.min(raw, N - 1);
      if (raw > N - 1) {
        planToDate = cp;
        nowIdx = N - 1;
      } else {
        const before = raw > 0 ? rows[raw - 1].cumPlan : 0;
        const frac = Math.min(1, ((today - rows[raw].ws) / 86400000 + 1) / 7);
        planToDate = before + rows[raw].planned * frac;
      }
    }

    const lastLogged = rows.reduce(
      (acc, r) => (r.actual !== null ? r.i : acc),
      -1
    );
    const drawUntil = Math.max(nowIdx, lastLogged);

    return {
      rows,
      N,
      total,
      totalPlan: cp,
      logged: ca,
      planToDate,
      nowIdx,
      drawUntil,
      start,
      end: rows[N - 1].we,
    };
  }, [config, planOverrides, actuals, topics, milestones, statuses, today]);

  const { rows, N, totalPlan, logged, planToDate, nowIdx, drawUntil } = model;
  const deviation = logged - planToDate;
  const remaining = Math.max(0, totalPlan - logged);
  const weeksLeft = nowIdx < 0 ? N : Math.max(0, N - nowIdx);
  const paceNeeded = weeksLeft > 0 ? remaining / weeksLeft : 0;
  const avgPlanned = N > 0 ? totalPlan / N : 0;
  const pagaende = rows.filter(
    (r) => r.i <= (nowIdx < 0 ? -1 : nowIdx) && r.status === "pagar"
  ).length;

  const chartData = useMemo(() => {
    const head = {
      label: "0",
      full: "Start",
      plan: 0,
      ført: 0,
      milestone: false,
    };
    const body = rows.map((r) => ({
      label: String(r.uke),
      full:
        `Uke ${r.uke} · ${fmtDay(r.ws)}–${fmtDay(r.we)}` +
        (r.topic ? ` — ${r.topic}` : ""),
      plan: Math.round(r.cumPlan * 10) / 10,
      ført:
        r.i <= drawUntil ? Math.round(r.cumActual * 10) / 10 : null,
      milestone: r.milestone,
    }));
    return [head, ...body];
  }, [rows, drawUntil]);

  const yMax = Math.max(totalPlan, logged) * 1.06 || 10;

  const setActual = (key, v) =>
    setActuals((p) => {
      const n = { ...p };
      if (String(v).trim() === "") delete n[key];
      else n[key] = v;
      return n;
    });

  const setOverride = (key, v) =>
    setPlanOverrides((p) => {
      const n = { ...p };
      if (String(v).trim() === "") delete n[key];
      else n[key] = v;
      return n;
    });

  const setTopic = (key, v) =>
    setTopics((p) => {
      const n = { ...p };
      if (String(v).trim() === "") delete n[key];
      else n[key] = v;
      return n;
    });

  const nesteStatus = (key) =>
    setStatuses((p) => {
      const na = p[key] || "ny";
      const ny = STATUSER[(STATUSER.indexOf(na) + 1) % STATUSER.length];
      const n = { ...p };
      if (ny === "ny") delete n[key];
      else n[key] = ny;
      return n;
    });

  const toggleMilestone = (key) =>
    setMilestones((p) => {
      const n = { ...p };
      if (n[key]) delete n[key];
      else n[key] = true;
      return n;
    });

  const exportCsv = () => {
    const head =
      "uke;fra;til;status;tema;milepæl;plan_timer;ført_timer;kum_plan;kum_ført\n";
    const body = rows
      .map((r) =>
        [
          r.uke,
          d2s(r.ws),
          d2s(r.we),
          STATUS_TEKST[r.status],
          `"${String(r.topic).replace(/"/g, '""')}"`,
          r.milestone ? "ja" : "",
          nf(r.planned),
          r.actual === null ? "" : nf(r.actual),
          nf(r.cumPlan),
          nf(r.cumActual),
        ].join(";")
      )
      .join("\n");
    const blob = new Blob([head + body], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timeliste.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const devTone = deviation < -0.05 ? C.behind : deviation > 0.05 ? C.ahead : C.ink;

  return (
    <div
      className="w-full min-h-screen p-5 sm:p-8"
      style={{
        background: C.paper,
        color: C.ink,
        fontFamily:
          "'Inter', 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif",
      }}
    >
      <div className="mx-auto" style={{ maxWidth: "1000px" }}>
        {/* topp */}
        <header className="flex flex-wrap items-end justify-between gap-6 mb-6">
          <div>
            <h1
              className="text-xl sm:text-2xl"
              style={{ letterSpacing: "-0.015em" }}
            >
              Prosjektoppgave · timeregnskap
            </h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              7,5 sp · {nf(totalPlan)} timer planlagt over {N} uker ·{" "}
              {nf(avgPlanned)} t/uke i snitt
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: C.muted }}>
              Avvik fra plan i dag
            </div>
            <div
              className="text-4xl sm:text-5xl"
              style={{
                color: devTone,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.03em",
              }}
            >
              {signed(deviation)}
              <span className="text-xl ml-1" style={{ color: C.faint }}>
                t
              </span>
            </div>
          </div>
        </header>

        {conflict && (
          <section
            className="p-4 mb-5"
            style={{
              background: "#FDF3F2",
              border: `1px solid ${C.behind}`,
              borderRadius: "4px",
            }}
          >
            <h2 className="text-sm mb-1" style={{ color: C.behind }}>
              Timelista ble endret på en annen enhet
            </h2>
            <p className="text-sm mb-3" style={{ color: C.ink }}>
              Sikkerhetskopien på GitHub ble oppdatert{" "}
              {new Date(conflict.when).toLocaleString("nb-NO", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
              , etter at denne fanen ble åpnet. Endringene du har gjort her er
              lagret lokalt, men ikke sendt til GitHub. Velg hvilken versjon som
              skal gjelde.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={brukEkstern}
                className="px-3 py-2 text-sm rounded"
                style={{ border: `1px solid ${C.actual}`, color: C.actual }}
              >
                Bruk den andre enhetens versjon
              </button>
              <button
                onClick={beholdMine}
                className="px-3 py-2 text-sm rounded"
                style={{ border: `1px solid ${C.behind}`, color: C.behind }}
              >
                Behold mine og overskriv
              </button>
            </div>
            <p className="text-xs mt-3" style={{ color: C.muted }}>
              Usikker? Last ned CSV først — da har du begge versjonene.
            </p>
          </section>
        )}

        {/* diagram */}
        <section
          className="p-4 sm:p-5 mb-5"
          style={{
            background: C.surface,
            border: `1px solid ${C.rule}`,
            borderRadius: "4px",
          }}
        >
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 4, left: -12 }}
              >
                <CartesianGrid stroke={C.rule} strokeDasharray="0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: C.muted, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: C.rule }}
                  interval="preserveStartEnd"
                  minTickGap={8}
                />
                <YAxis
                  yAxisId="cum"
                  domain={[0, Math.ceil(yMax / 10) * 10]}
                  tick={{ fill: C.muted, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: C.surface,
                    border: `1px solid ${C.rule}`,
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                  labelFormatter={(_, p) =>
                    p && p[0] ? p[0].payload.full : ""
                  }
                  formatter={(v, name) =>
                    v === null || v === undefined
                      ? ["–", name]
                      : [`${nf(v)} t`, name]
                  }
                />
                <Area
                  yAxisId="cum"
                  type="monotone"
                  dataKey="ført"
                  name="Ført, kumulativt"
                  stroke="none"
                  fill={C.actualFill}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="cum"
                  type="monotone"
                  dataKey="plan"
                  name="Plan (S-kurve)"
                  stroke={C.plan}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={<MilestoneDot />}
                  activeDot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="cum"
                  type="monotone"
                  dataKey="ført"
                  name="Ført, kumulativt"
                  stroke={C.actual}
                  strokeWidth={2.4}
                  dot={{ r: 2, fill: C.actual, strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {nowIdx >= 0 && (
                  <ReferenceLine
                    yAxisId="cum"
                    x={String(rows[nowIdx].uke)}
                    stroke={C.now}
                    strokeWidth={1.5}
                    label={{
                      value: "i dag",
                      position: "top",
                      fill: C.now,
                      fontSize: 11,
                    }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div
            className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 pt-3 text-xs"
            style={{ borderTop: `1px solid ${C.rule}`, color: C.muted }}
          >
            <span className="flex items-center gap-2">
              <svg width="22" height="8">
                <line
                  x1="0"
                  y1="4"
                  x2="22"
                  y2="4"
                  stroke={C.plan}
                  strokeWidth="2"
                  strokeDasharray="5 4"
                />
              </svg>
              Referanse: planlagt kumulativ innsats
            </span>
            <span className="flex items-center gap-2">
              <svg width="22" height="8">
                <line
                  x1="0"
                  y1="4"
                  x2="22"
                  y2="4"
                  stroke={C.actual}
                  strokeWidth="2.4"
                />
              </svg>
              Målt: faktisk førte timer
            </span>
            <span className="flex items-center gap-2">
              <svg width="14" height="14">
                <path
                  d="M 7 1.5 L 12.5 7 L 7 12.5 L 1.5 7 Z"
                  fill={C.surface}
                  stroke={C.now}
                  strokeWidth="1.8"
                />
              </svg>
              Milepæl
            </span>
          </div>
        </section>

        {/* nøkkeltall */}
        <section
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5 p-4 sm:p-5 mb-5"
          style={{
            background: C.surface,
            border: `1px solid ${C.rule}`,
            borderRadius: "4px",
          }}
        >
          <Stat label="Ført så langt" value={nf(logged)} unit="t" />
          <Stat label="Plan til i dag" value={nf(planToDate)} unit="t" />
          <Stat label="Gjenstår" value={nf(remaining)} unit="t" />
          <Stat
            label={`Nødvendig snitt (${weeksLeft} uker igjen)`}
            value={nf(paceNeeded)}
            unit="t/uke"
            tone={paceNeeded > avgPlanned * 1.25 ? C.behind : C.ink}
          />
          <Stat
            label="Pågående oppgaver"
            value={String(pagaende)}
            tone={pagaende >= 3 ? C.behind : C.ink}
          />
        </section>

        {/* ukeliste */}
        <section
          className="mb-5"
          style={{
            background: C.surface,
            border: `1px solid ${C.rule}`,
            borderRadius: "4px",
          }}
        >
          <div
            className="flex items-center justify-between px-4 sm:px-5 py-3"
            style={{ borderBottom: `1px solid ${C.rule}` }}
          >
            <h2 className="text-sm">Uke for uke</h2>
            <span
              className="text-xs"
              style={{ color: sync.state === "feil" ? C.behind : C.faint }}
            >
              {status}
              {sync.msg ? " · " + sync.msg : ""}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
              <thead>
                <tr style={{ color: C.muted }}>
                  <th className="text-left font-normal px-4 sm:px-5 py-2 text-xs">
                    Uke
                  </th>
                  <th className="text-left font-normal py-2 text-xs">Dato</th>
                  <th className="text-left font-normal py-2 text-xs">Status</th>
                  <th
                    className="text-left font-normal py-2 text-xs pr-3"
                    style={{ width: "34%" }}
                  >
                    Tema
                  </th>
                  <th className="text-right font-normal py-2 text-xs pr-3">
                    Plan
                  </th>
                  <th className="text-right font-normal py-2 text-xs pr-3">
                    Ført
                  </th>
                  <th className="text-right font-normal py-2 text-xs">
                    Kum. plan
                  </th>
                  <th className="text-right font-normal py-2 text-xs">
                    Kum. ført
                  </th>
                  <th className="text-right font-normal px-4 sm:px-5 py-2 text-xs">
                    Avvik
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isNow = r.i === nowIdx;
                  const past = r.i <= drawUntil;
                  const dev = past ? r.cumActual - r.cumPlan : null;
                  return (
                    <tr
                      key={r.key}
                      style={{
                        borderTop: `1px solid ${C.rule}`,
                        background: isNow ? "rgba(185,139,29,0.07)" : "transparent",
                      }}
                    >
                      <td
                        className="px-4 sm:px-5 py-2"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {r.uke}
                        {isNow && (
                          <span
                            className="ml-2 text-xs"
                            style={{ color: C.now }}
                          >
                            nå
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-xs" style={{ color: C.muted }}>
                        {fmtDay(r.ws)}–{fmtDay(r.we)}
                      </td>
                      <td className="py-2 pr-2">
                        <button
                          onClick={() => nesteStatus(r.key)}
                          title="Klikk for å bytte status"
                          className="flex items-center gap-1.5 px-2 py-1 rounded w-full focus:ring-2"
                          style={{
                            border: `1px solid ${C.rule}`,
                            background:
                              r.status === "pagar"
                                ? "rgba(185,139,29,0.10)"
                                : r.status === "ferdig"
                                ? "rgba(46,107,79,0.08)"
                                : "transparent",
                            color:
                              r.status === "pagar"
                                ? C.now
                                : r.status === "ferdig"
                                ? C.ahead
                                : C.faint,
                            fontSize: "12px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <StatusIkon status={r.status} />
                          {STATUS_TEKST[r.status]}
                        </button>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleMilestone(r.key)}
                            title={
                              r.milestone
                                ? "Fjern milepæl"
                                : "Merk uka som milepæl"
                            }
                            aria-pressed={r.milestone}
                            className="shrink-0 rounded p-1 focus:ring-2"
                          >
                            <svg width="13" height="13">
                              <path
                                d="M 6.5 1 L 12 6.5 L 6.5 12 L 1 6.5 Z"
                                fill={r.milestone ? C.now : "none"}
                                stroke={r.milestone ? C.now : C.faint}
                                strokeWidth="1.6"
                              />
                            </svg>
                          </button>
                          <input
                            type="text"
                            value={topics[r.key] ?? ""}
                            placeholder="Hva skal gjøres denne uka"
                            onChange={(e) => setTopic(r.key, e.target.value)}
                            className="w-full py-1 px-2 rounded outline-none focus:ring-2"
                            style={{
                              border: `1px solid ${C.rule}`,
                              background: C.surface,
                              color: C.ink,
                            }}
                          />
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <NumCell
                          value={planOverrides[r.key] ?? ""}
                          placeholder={nf(r.auto)}
                          onChange={(v) => setOverride(r.key, v)}
                        />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <NumCell
                          value={actuals[r.key] ?? ""}
                          placeholder="–"
                          emphasis
                          onChange={(v) => setActual(r.key, v)}
                        />
                      </td>
                      <td
                        className="py-2 text-right"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          color: C.muted,
                        }}
                      >
                        {nf(r.cumPlan)}
                      </td>
                      <td
                        className="py-2 text-right"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {past ? nf(r.cumActual) : "–"}
                      </td>
                      <td
                        className="px-4 sm:px-5 py-2 text-right"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          color:
                            dev === null
                              ? C.faint
                              : dev < -0.05
                              ? C.behind
                              : dev > 0.05
                              ? C.ahead
                              : C.muted,
                        }}
                      >
                        {dev === null ? "–" : signed(dev)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            className="px-4 sm:px-5 py-3 text-xs"
            style={{ borderTop: `1px solid ${C.rule}`, color: C.muted }}
          >
            Plan-feltet viser S-kurven som grå hjelpetekst. Skriv inn et tall for
            å overstyre en enkelt uke — for eksempel 0 i reiseuka eller i
            eksamensperioden. Klikk på romben for å merke en uke som milepæl;
            den dukker opp på plankurven. Statusknappen blar mellom ikke
            startet, pågår og ferdig, og teller opp «Pågående oppgaver» over.
          </div>
        </section>

        {/* innstillinger */}
        <section
          style={{
            background: C.surface,
            border: `1px solid ${C.rule}`,
            borderRadius: "4px",
          }}
        >
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="w-full text-left px-4 sm:px-5 py-3 text-sm"
            style={{ color: C.ink }}
          >
            {showSettings ? "Skjul oppsett" : "Endre oppsett"}
          </button>

          {showSettings && (
            <div
              className="px-4 sm:px-5 py-4 grid gap-5 sm:grid-cols-2"
              style={{ borderTop: `1px solid ${C.rule}` }}
            >
              <label className="flex flex-col gap-1 text-sm">
                <span style={{ color: C.muted }}>Startdato</span>
                <input
                  type="date"
                  value={config.start}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, start: e.target.value }))
                  }
                  className="py-1.5 px-2 rounded"
                  style={{ border: `1px solid ${C.rule}`, color: C.ink }}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span style={{ color: C.muted }}>Innleveringsfrist</span>
                <input
                  type="date"
                  value={config.end}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, end: e.target.value }))
                  }
                  className="py-1.5 px-2 rounded"
                  style={{ border: `1px solid ${C.rule}`, color: C.ink }}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span style={{ color: C.muted }}>
                  Timebudsjett totalt (7,5 sp ≈ 190–225 t)
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={config.total}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, total: e.target.value }))
                  }
                  className="py-1.5 px-2 rounded"
                  style={{
                    border: `1px solid ${C.rule}`,
                    color: C.ink,
                    fontVariantNumeric: "tabular-nums",
                  }}
                />
              </label>

              <div className="flex flex-col gap-1 text-sm">
                <span style={{ color: C.muted }}>
                  Tyngdepunkt: {Math.round(config.midpoint * 100)} % ut i
                  perioden
                </span>
                <input
                  type="range"
                  min="0.3"
                  max="0.8"
                  step="0.05"
                  value={config.midpoint}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      midpoint: parseFloat(e.target.value),
                    }))
                  }
                />
                <span className="text-xs" style={{ color: C.faint }}>
                  Flytt mot høyre hvis mesteparten av skrivingen kommer sent.
                </span>
              </div>

              <div className="flex flex-col gap-1 text-sm">
                <span style={{ color: C.muted }}>
                  Bratthet: {config.steep}
                </span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={config.steep}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      steep: parseFloat(e.target.value),
                    }))
                  }
                />
                <span className="text-xs" style={{ color: C.faint }}>
                  Lav verdi gir tilnærmet jevn belastning, høy verdi gir en
                  markert topp i midten.
                </span>
              </div>

              <div
                className="sm:col-span-2 pt-4"
                style={{ borderTop: `1px solid ${C.rule}` }}
              >
                <h3 className="text-sm mb-1">Sikkerhetskopi til GitHub</h3>
                <p className="text-xs mb-3" style={{ color: C.muted }}>
                  Timene lagres i en privat gist på GitHub-kontoen din i tillegg
                  til nettleseren. Da overlever de at nettleserdata tømmes eller
                  at maskinen byttes. Du trenger et personal access token med
                  gist-tilgang, uten utløpsdato.
                </p>

                {token ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className="text-sm px-2 py-1 rounded"
                      style={{
                        background: "rgba(18,97,92,0.08)",
                        color: C.actual,
                      }}
                    >
                      Tilkoblet
                    </span>
                    {gistId && (
                      <a
                        href={"https://gist.github.com/" + gistId}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm underline"
                        style={{ color: C.muted }}
                      >
                        Åpne gisten
                      </a>
                    )}
                    <button
                      onClick={hentNa}
                      className="px-3 py-2 text-sm rounded"
                      style={{ border: `1px solid ${C.rule}`, color: C.ink }}
                    >
                      Hent fra GitHub
                    </button>
                    <button
                      onClick={kobleFra}
                      className="px-3 py-2 text-sm rounded"
                      style={{ border: `1px solid ${C.rule}`, color: C.muted }}
                    >
                      Koble fra
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="password"
                      value={tokenDraft}
                      placeholder="github_pat_… eller ghp_…"
                      onChange={(e) => setTokenDraft(e.target.value)}
                      className="py-1.5 px-2 rounded grow"
                      style={{
                        border: `1px solid ${C.rule}`,
                        color: C.ink,
                        minWidth: "240px",
                      }}
                    />
                    <button
                      onClick={kobleTil}
                      className="px-3 py-2 text-sm rounded"
                      style={{
                        border: `1px solid ${C.actual}`,
                        color: C.actual,
                      }}
                    >
                      Koble til
                    </button>
                  </div>
                )}

                {sync.msg && (
                  <p
                    className="text-xs mt-2"
                    style={{
                      color: sync.state === "feil" ? C.behind : C.muted,
                    }}
                  >
                    {sync.msg}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
                <button
                  onClick={exportCsv}
                  className="px-3 py-2 text-sm rounded"
                  style={{ border: `1px solid ${C.rule}`, color: C.ink }}
                >
                  Last ned CSV
                </button>
                <button
                  onClick={() => setPlanOverrides({})}
                  className="px-3 py-2 text-sm rounded"
                  style={{ border: `1px solid ${C.rule}`, color: C.ink }}
                >
                  Tilbakestill planoverstyringer
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Slette alle førte timer? Dette kan ikke angres."
                      )
                    )
                      setActuals({});
                  }}
                  className="px-3 py-2 text-sm rounded"
                  style={{ border: `1px solid ${C.behind}`, color: C.behind }}
                >
                  Slett alle førte timer
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="text-xs mt-4" style={{ color: C.faint }}>
          Timene lagres i nettleseren, og i en privat gist hvis du kobler til GitHub. De er bare synlige for deg.
        </p>
      </div>
    </div>
  );
}
