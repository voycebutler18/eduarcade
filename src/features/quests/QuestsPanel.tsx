import { useEffect, useMemo, useState } from "react";
import { useProfile } from "../../state/profile";

/**
 * QuestsPanel (MVP, client-only)
 * - Daily & Weekly quests with simple local tracking (per-username)
 * - Claim rewards to grant Coins immediately
 * - Auto-regenerates new daily set each day and weekly set each Monday
 */

type QuestKind = "daily" | "weekly";
type Quest = {
  id: string;
  kind: QuestKind;
  title: string;
  rewardCoins: number;
  progress: number; // 0..target
  target: number;
  done: boolean;
  claimed: boolean;
};

type SaveBlob = {
  dkey: string; // daily key (UTC date)
  wkey: string; // weekly key (UTC week)
  dailies: Quest[];
  weeklies: Quest[];
};

function todayKeyUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function weekKeyUTC() {
  // Monday of the current ISO week (UTC) → string key
  const d = new Date();
  const day = d.getUTCDay(); // 0..6, Sun..Sat
  const diffToMon = (day + 6) % 7;
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMon));
  return `${mon.getUTCFullYear()}-W${pad2(weekNumber(mon))}`;
}
function weekNumber(mon: Date) {
  const start = new Date(Date.UTC(mon.getUTCFullYear(), 0, 1));
  const diff = Number(mon) - Number(start);
  return Math.floor(diff / (7 * 24 * 3600 * 1000)) + 1;
}
function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function makeDailySet(): Quest[] {
  const pool: Omit<Quest, "id" | "progress" | "done" | "claimed">[] = [
    { kind: "daily", title: "Pass a 5-Q Skill Check", rewardCoins: 60, target: 1 },
    { kind: "daily", title: "Queue for a Party Playlist", rewardCoins: 40, target: 1 },
    { kind: "daily", title: "Customize your Hero", rewardCoins: 30, target: 1 },
    { kind: "daily", title: "Build Worlds: edit a map", rewardCoins: 50, target: 1 },
    { kind: "daily", title: "Send 3 friendly chat messages", rewardCoins: 45, target: 3 },
  ];
  const picks = shuffle(pool).slice(3); // 2–3 dailies
  return picks.map((q) => ({ ...q, id: `d_${uid()}`, progress: 0, done: false, claimed: false }));
}

function makeWeeklySet(): Quest[] {
  const pool: Omit<Quest, "id" | "progress" | "done" | "claimed">[] = [
    { kind: "weekly", title: "Complete 5 Skill Checks", rewardCoins: 220, target: 5 },
    { kind: "weekly", title: "Build Worlds: publish/export 1 map", rewardCoins: 180, target: 1 },
    { kind: "weekly", title: "Earn 3 new cosmetic items", rewardCoins: 200, target: 3 },
    { kind: "weekly", title: "Send 15 positive chat messages", rewardCoins: 150, target: 15 },
  ];
  const picks = shuffle(pool).slice(2); // 2 weeklies
  return picks.map((q) => ({ ...q, id: `w_${uid()}`, progress: 0, done: false, claimed: false }));
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** NEW: summarize helper that the panel uses */
function summarize(list: Quest[]) {
  const total = list.length;
  let done = 0,
    claimed = 0;
  for (const q of list) {
    if (q.done) done++;
    if (q.claimed) claimed++;
  }
  return { total, done, claimed };
}

export default function QuestsPanel() {
  const { profile, grantCoins } = useProfile();
  const username = profile?.username?.trim() || "guest";
  const storageKey = `eva_quests_${username}`;

  const [blob, setBlob] = useState<SaveBlob | null>(null);

  // Load or generate quest sets
  useEffect(() => {
    const dkey = todayKeyUTC();
    const wkey = weekKeyUTC();
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed: SaveBlob = JSON.parse(raw);
        const dailies = parsed.dkey === dkey ? parsed.dailies : makeDailySet();
        const weeklies = parsed.wkey === wkey ? parsed.weeklies : makeWeeklySet();
        setBlob({ dkey, wkey, dailies, weeklies });
        return;
      } catch {
        /* fallthrough to regenerate */
      }
    }
    setBlob({ dkey, wkey, dailies: makeDailySet(), weeklies: makeWeeklySet() });
  }, [storageKey]);

  // Persist on change
  useEffect(() => {
    if (!blob) return;
    localStorage.setItem(storageKey, JSON.stringify(blob));
  }, [blob, storageKey]);

  const dProgress = useMemo(() => summarize(blob?.dailies || []), [blob]);
  const wProgress = useMemo(() => summarize(blob?.weeklies || []), [blob]);

  function bump(qid: string, kind: QuestKind, by: number = 1) {
    if (!blob) return;
    const list = kind === "daily" ? [...blob.dailies] : [...blob.weeklies];
    const idx = list.findIndex((q) => q.id === qid);
    if (idx === -1) return;
    const q = { ...list[idx] };
    q.progress = Math.min(q.target, q.progress + by);
    q.done = q.progress >= q.target;
    list[idx] = q;
    setBlob(kind === "daily" ? { ...blob, dailies: list } : { ...blob, weeklies: list });
  }

  function claim(qid: string, kind: QuestKind) {
    if (!blob) return;
    const list = kind === "daily" ? [...blob.dailies] : [...blob.weeklies];
    const idx = list.findIndex((q) => q.id === qid);
    if (idx === -1) return;
    const q = { ...list[idx] };
    if (!q.done || q.claimed) return;
    q.claimed = true;
    list[idx] = q;
    setBlob(kind === "daily" ? { ...blob, dailies: list } : { ...blob, weeklies: list });
    grantCoins(q.rewardCoins);
  }

  if (!blob) {
    return (
      <div className="quests">
        <h3>Quests</h3>
        <div className="muted small">Loading…</div>
      </div>
    );
  }

  return (
    <div className="quests">
      <div className="hdr">
        <h3 style={{ margin: 0 }}>Quests</h3>
        <div className="muted small">
          Daily refresh (UTC): {blob.dkey} • Weekly: {blob.wkey}
        </div>
      </div>

      {/* Daily Quests */}
      <section className="section">
        <div className="bar">
          <strong>Daily</strong>
          <span className="muted small">
            {dProgress.done}/{dProgress.total} done • {dProgress.claimed} claimed
          </span>
        </div>
        <div className="grid">
          {blob.dailies.map((q) => (
            <QuestCard
              key={q.id}
              q={q}
              onBump={() => bump(q.id, "daily")}
              onClaim={() => claim(q.id, "daily")}
            />
          ))}
        </div>
      </section>

      {/* Weekly Quests */}
      <section className="section">
        <div className="bar">
          <strong>Weekly</strong>
          <span className="muted small">
            {wProgress.done}/{wProgress.total} done • {wProgress.claimed} claimed
          </span>
        </div>
        <div className="grid">
          {blob.weeklies.map((q) => (
            <QuestCard
              key={q.id}
              q={q}
              onBump={() => bump(q.id, "weekly")}
              onClaim={() => claim(q.id, "weekly")}
            />
          ))}
        </div>
      </section>

      {/* Dev helper (reset today) */}
      <div className="devrow">
        <button
          className="ghost"
          onClick={() =>
            setBlob((b) =>
              b
                ? { ...b, dkey: "DEV", dailies: makeDailySet() }
                : { dkey: "DEV", wkey: weekKeyUTC(), dailies: makeDailySet(), weeklies: makeWeeklySet() }
            )
          }
          title="Generate a fresh daily set"
        >
          Reset Dailies (dev)
        </button>
      </div>

      <style>{`
        .quests{ display:flex; flex-direction:column; gap:12px; }
        .hdr{
          background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06);
          border-radius:12px; padding:10px;
        }
        .section{ display:flex; flex-direction:column; gap:8px; }
        .bar{
          display:flex; align-items:center; justify-content:space-between;
          background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06);
          border-radius:10px; padding:8px 10px;
        }
        .grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap:10px; }
        .card{
          background:#111a2d; border:1px solid rgba(255,255,255,.08);
          border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:8px;
        }
        .title{ font-weight:700; }
        .row{ display:grid; grid-template-columns: 1fr auto; gap:8px; align-items:center; }
        .track{ height:8px; border-radius:999px; background:#0b1220; border:1px solid rgba(255,255,255,.06); overflow:hidden; }
        .fill{ height:100%; background:linear-gradient(90deg, #60a5fa, #22d3ee); }
        .btns{ display:flex; gap:8px; justify-content:flex-end; }
        .primary{
          background:linear-gradient(90deg, #60a5fa, #22d3ee); color:#09121e; font-weight:700;
          border:none; padding:8px 12px; border-radius:10px; cursor:pointer; box-shadow:0 6px 18px rgba(34,211,238,.25);
        }
        .ghost{
          background:transparent; border:1px solid rgba(255,255,255,.12);
          color:#e6edf7; border-radius:10px; padding:8px 12px; cursor:pointer;
        }
        .muted{ color:#9fb0c7; }
        .small{ font-size:12px; }
        .ok{ color:#22c55e; font-weight:700; }
        .claimedTag{
          font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid rgba(255,255,255,.14); color:#9fb0c7;
        }
        .devrow{ display:flex; justify-content:flex-end; }
      `}</style>
    </div>
  );
}

function QuestCard({
  q,
  onBump,
  onClaim,
}: {
  q: Quest;
  onBump: () => void;
  onClaim: () => void;
}) {
  const pct = Math.round((q.progress / q.target) * 100);
  return (
    <div className="card">
      <div className="row">
        <div className="title">{q.title}</div>
        <div className="claimedTag">{q.kind.toUpperCase()}</div>
      </div>

      <div className="row">
        <div className="muted small">
          Reward: <strong className="ok">+{q.rewardCoins}c</strong>
        </div>
        <div className="muted small">
          {q.progress}/{q.target}
        </div>
      </div>

      <div
        className="track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={q.target}
        aria-valuenow={q.progress}
      >
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="btns">
        {!q.done ? (
          <button className="ghost" onClick={onBump} title="Simulate progress for MVP">
            Mark +1
          </button>
        ) : q.claimed ? (
          <button className="ghost" disabled>
            Claimed
          </button>
        ) : (
          <button className="primary" onClick={onClaim}>
            Claim
          </button>
        )}
      </div>
    </div>
  );
}
