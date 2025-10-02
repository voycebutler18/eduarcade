import { useEffect, useMemo, useState } from "react";
import { useAge, useProfile } from "../../state/profile";

/**
 * ProgressCard (MVP, client-only, printable)
 * - Pulls username, coins, and age from profile store
 * - Reads quest progress from localStorage (same keys used in QuestsPanel)
 * - Generates a teacher/parent-friendly printable progress card
 * - One click: Print
 *
 * Usage (wire wherever you want later, e.g. Play tab or a Settings page):
 *   import ProgressCard from "./features/progress/ProgressCard";
 *   <ProgressCard />
 */

type Quest = {
  id: string;
  kind: "daily" | "weekly";
  title: string;
  rewardCoins: number;
  progress: number;
  target: number;
  done: boolean;
  claimed: boolean;
};
type SaveBlob = {
  dkey: string;
  wkey: string;
  dailies: Quest[];
  weeklies: Quest[];
};

export default function ProgressCard() {
  const { profile, wallet } = useProfile();
  const age = useAge();

  const username = profile?.username?.trim() || "guest";
  const questsKey = `eva_quests_${username}`;

  const [quests, setQuests] = useState<SaveBlob | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(questsKey);
      if (raw) setQuests(JSON.parse(raw));
    } catch {
      // ignore parse errors
    }
    // refresh if another tab updates storage
    function onStorage(e: StorageEvent) {
      if (e.key === questsKey && e.newValue) {
        try {
          setQuests(JSON.parse(e.newValue));
        } catch {}
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [questsKey]);

  const daily = useMemo(() => summarize(quests?.dailies || []), [quests]);
  const weekly = useMemo(() => summarize(quests?.weeklies || []), [quests]);

  const approxGrade = ageToGrade(age);
  const today = new Date().toLocaleDateString();

  return (
    <div className="pcardWrap">
      <div className="pcard" id="print-card">
        <div className="hdr">
          <div className="logo">EduVerse Arena</div>
          <div className="date">{today}</div>
        </div>

        <div className="row">
          <div className="cell">
            <div className="lab">Student</div>
            <div className="val">{username}</div>
          </div>
          <div className="cell">
            <div className="lab">Age</div>
            <div className="val">{age ?? "—"}</div>
          </div>
          <div className="cell">
            <div className="lab">Approx. Grade</div>
            <div className="val">{approxGrade ?? "—"}</div>
          </div>
          <div className="cell">
            <div className="lab">Coins</div>
            <div className="val coins">{wallet.coins.toLocaleString()}c</div>
          </div>
        </div>

        <div className="section">
          <div className="stitle">Daily Quests</div>
          <div className="srow">
            <div className="badge">{daily.done}/{daily.total} done</div>
            <div className="badge">{daily.claimed} claimed</div>
          </div>
          <ul className="list">
            {(quests?.dailies || []).map((q) => (
              <li key={q.id}>
                <div className="qtitle">{q.title}</div>
                <div className="qmeter">
                  <div className="qfill" style={{ width: `${Math.round((q.progress / q.target) * 100)}%` }} />
                </div>
                <div className="qmeta">{q.progress}/{q.target} • +{q.rewardCoins}c {q.claimed ? "• Claimed" : q.done ? "• Ready to claim" : ""}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="section">
          <div className="stitle">Weekly Quests</div>
          <div className="srow">
            <div className="badge">{weekly.done}/{weekly.total} done</div>
            <div className="badge">{weekly.claimed} claimed</div>
          </div>
          <ul className="list">
            {(quests?.weeklies || []).map((q) => (
              <li key={q.id}>
                <div className="qtitle">{q.title}</div>
                <div className="qmeter">
                  <div className="qfill" style={{ width: `${Math.round((q.progress / q.target) * 100)}%` }} />
                </div>
                <div className="qmeta">{q.progress}/{q.target} • +{q.rewardCoins}c {q.claimed ? "• Claimed" : q.done ? "• Ready to claim" : ""}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="foot">
          <div className="note">
            * This report summarizes in-game quest progress and Coins. Skill mastery and standards alignment will be added when connected to Supabase & OpenAI.
          </div>
          <div className="sig">
            Teacher / Parent Signature: ___________________________
          </div>
        </div>
      </div>

      <div className="actions no-print">
        <button className="ghost" onClick={() => copySummary(username, age ?? undefined, approxGrade, wallet.coins, daily, weekly)}>
          Copy Summary
        </button>
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <style>{`
        .pcardWrap{ display:flex; flex-direction:column; gap:12px; }
        .pcard{
          background:#ffffff; color:#0b1220; border-radius:12px;
          border:1px solid #e5e7eb; padding:14px; max-width:900px;
          box-shadow: 0 8px 24px rgba(0,0,0,.06);
          margin: 0 auto;
        }
        .hdr{ display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0ea5e9; padding-bottom:8px; }
        .logo{ font-weight:900; letter-spacing:.3px; color:#0ea5e9; }
        .date{ color:#6b7280; font-size:12px; }
        .row{ display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; margin-top:10px; }
        .cell{ background:#f8fafc; border:1px solid #e5e7eb; border-radius:10px; padding:8px; }
        .lab{ font-size:11px; color:#64748b; }
        .val{ font-weight:800; }
        .coins{ color:#b45309; }
        .section{ margin-top:14px; }
        .stitle{ font-weight:800; color:#0f172a; }
        .srow{ display:flex; gap:8px; margin:6px 0 8px; }
        .badge{ font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid #e5e7eb; color:#475569; background:#f8fafc; }
        .list{ display:grid; gap:8px; margin:0; padding:0; list-style:none; }
        .list li{ border:1px solid #e5e7eb; border-radius:10px; padding:10px; background:#ffffff; }
        .qtitle{ font-weight:700; color:#111827; }
        .qmeter{ height:8px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:999px; overflow:hidden; margin:6px 0; }
        .qfill{ height:100%; background:linear-gradient(90deg, #60a5fa, #22d3ee); }
        .qmeta{ font-size:12px; color:#475569; }
        .foot{ display:flex; justify-content:space-between; gap:12px; align-items:flex-end; margin-top:12px; }
        .note{ font-size:11px; color:#64748b; }
        .sig{ font-size:12px; }
        .actions{ display:flex; justify-content:flex-end; gap:8px; }
        .primary{
          background:linear-gradient(90deg, #60a5fa, #22d3ee); color:#09121e; font-weight:700;
          border:none; padding:10px 14px; border-radius:10px; cursor:pointer; box-shadow:0 6px 18px rgba(34,211,238,.25);
        }
        .ghost{
          background:transparent; border:1px solid rgba(15,23,42,.2);
          color:#0f172a; border-radius:10px; padding:8px 12px; cursor:pointer;
        }
        @media print {
          body { background:#fff; }
          .no-print { display:none !important; }
          .pcard { box-shadow:none; border:none; max-width:100%; }
        }
      `}</style>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function summarize(list: Quest[]) {
  const total = list.length;
  let done = 0, claimed = 0;
  for (const q of list) {
    if (q.done) done++;
    if (q.claimed) claimed++;
  }
  return { total, done, claimed };
}

function copySummary(
  username: string,
  age: number | undefined,
  grade: string | null,
  coins: number,
  daily: { total: number; done: number; claimed: number },
  weekly: { total: number; done: number; claimed: number }
) {
  const lines = [
    `EduVerse Arena — Progress Summary`,
    `Student: ${username}`,
    `Age: ${age ?? "—"}  Grade: ${grade ?? "—"}`,
    `Coins: ${coins}`,
    `Daily Quests: ${daily.done}/${daily.total} done • ${daily.claimed} claimed`,
    `Weekly Quests: ${weekly.done}/${weekly.total} done • ${weekly.claimed} claimed`,
  ];
  navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
}

function ageToGrade(age: number | null): string | null {
  if (age == null) return null;
  // rough US mapping (approximate)
  if (age <= 4) return "Pre-K";
  if (age === 5) return "K";
  const grade = age - 5; // 6->1st, 7->2nd, ...
  if (grade >= 1 && grade <= 12) return `G${grade}`;
  if (grade > 12) return "HS+";
  return null;
}
