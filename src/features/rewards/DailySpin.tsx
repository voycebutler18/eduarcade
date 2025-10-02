import { useEffect, useMemo, useRef, useState } from "react";
import { useProfile } from "../../state/profile";

/**
 * DailySpin (MVP, client-only)
 * - One spin per user per day (tracked in localStorage by username)
 * - Weighted rewards (coins + occasional cosmetic token placeholder)
 * - On win: grants Coins immediately via wallet
 * - Animated dial; large, kid-friendly UI
 *
 * Usage idea:
 *   import DailySpin from "./features/rewards/DailySpin";
 *   <DailySpin />
 */

type Reward = {
  id: string;
  label: string;
  coins?: number; // coin reward
  weight: number; // relative weight for RNG
  color: string; // slice color
};

const REWARDS: Reward[] = [
  { id: "c40", label: "+40c", coins: 40, weight: 18, color: "#334155" },
  { id: "c60", label: "+60c", coins: 60, weight: 16, color: "#3b425a" },
  { id: "c80", label: "+80c", coins: 80, weight: 14, color: "#2b3551" },
  { id: "c120", label: "+120c", coins: 120, weight: 10, color: "#22304b" },
  { id: "c150", label: "+150c", coins: 150, weight: 8, color: "#1e2a43" },
  { id: "c200", label: "+200c", coins: 200, weight: 6, color: "#1b283f" },
  { id: "c260", label: "+260c", coins: 260, weight: 4, color: "#18243a" },
  { id: "c300", label: "+300c", coins: 300, weight: 3, color: "#152235" },
  // keep one rare "jackpot" at tiny weight
  { id: "c600", label: "🎉 +600c", coins: 600, weight: 1, color: "#123" },
];

function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function pickWeighted<T extends { weight: number }>(arr: T[]) {
  const total = arr.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const a of arr) {
    if ((r -= a.weight) <= 0) return a;
  }
  return arr[arr.length - 1];
}

export default function DailySpin() {
  const { profile, grantCoins } = useProfile();
  const username = profile?.username?.trim() || "guest";
  const storageKey = `eva_spin_${username}_${todayKey()}`;

  const [spun, setSpun] = useState<boolean>(() => !!localStorage.getItem(storageKey));
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Reward | null>(null);

  // Dial animation
  const [angle, setAngle] = useState(0);
  const animRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const startAngleRef = useRef<number>(0);
  const endAngleRef = useRef<number>(0);

  // Precompute slice angles
  const slices = useMemo(() => {
    const n = REWARDS.length;
    const degPer = 360 / n;
    return REWARDS.map((r, i) => ({
      ...r,
      startDeg: i * degPer,
      endDeg: (i + 1) * degPer,
      midDeg: i * degPer + degPer / 2,
    }));
  }, []);

  function spin() {
    if (spun || spinning) return;
    // Pick reward
    const chosen = pickWeighted(REWARDS);
    setResult(chosen);

    // Find slice index
    const idx = REWARDS.findIndex((r) => r.id === chosen.id);
    const n = REWARDS.length;
    const degPer = 360 / n;

    // Target angle for the pointer to land on the middle of the chosen slice.
    // Pointer is fixed at 0deg (top). We rotate the wheel.
    const targetSliceMid = idx * degPer + degPer / 2;
    const extraSpins = 5; // full spins for flair
    const targetAngle = extraSpins * 360 + (360 - targetSliceMid); // rotate so chosen mid ends at 0deg

    // Animate with ease-out cubic over ~3.2s
    startRef.current = performance.now();
    durationRef.current = 3200 + Math.random() * 600;
    startAngleRef.current = angle % 360;
    endAngleRef.current = startAngleRef.current + targetAngle;

    setSpinning(true);
    animRef.current = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    const t0 = startRef.current;
    const dur = durationRef.current;
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    const a = startAngleRef.current + (endAngleRef.current - startAngleRef.current) * eased;
    setAngle(a);

    if (p < 1) {
      animRef.current = requestAnimationFrame(tick);
    } else {
      stopSpin();
    }
  }

  function stopSpin() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    setSpinning(false);
    setSpun(true);
    // persist
    localStorage.setItem(storageKey, "1");
    // grant
    if (result?.coins) {
      grantCoins(result.coins);
    }
  }

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="spin">
      <div className="row">
        <div>
          <h3 style={{ margin: 0 }}>Daily Spin</h3>
          <div className="muted small">
            {spun ? "Come back tomorrow for another spin!" : "One spin per day. Good luck!"}
          </div>
        </div>
        <button className="primary" onClick={spin} disabled={spun || spinning}>
          {spinning ? "Spinning…" : spun ? "Done" : "Spin"}
        </button>
      </div>

      <div className="wheelWrap">
        <div className="pointer">▼</div>
        <svg
          viewBox="-110 -110 220 220"
          width="100%"
          height="220"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          {/* Wheel background */}
          <circle cx="0" cy="0" r="100" fill="#0f172a" stroke="rgba(255,255,255,.12)" strokeWidth="2" />
          {slices.map((s, i) => (
            <g key={s.id}>
              <path
                d={arcPath(0, 0, 100, toRad(s.startDeg), toRad(s.endDeg))}
                fill={s.color}
                stroke="rgba(255,255,255,.06)"
                strokeWidth="1"
              />
              <text
                x={(Math.cos(toRad(s.midDeg)) * 70).toFixed(2)}
                y={(Math.sin(toRad(s.midDeg)) * 70).toFixed(2)}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="12"
                fill="#e6edf7"
              >
                {s.label}
              </text>
            </g>
          ))}
          {/* center */}
          <circle cx="0" cy="0" r="14" fill="#121a2c" stroke="rgba(255,255,255,.18)" />
        </svg>
      </div>

      {result && (
        <div className="result">
          <span className="muted">Result:</span>{" "}
          <strong>{result.label}</strong>{" "}
          {result.coins ? <span className="ok">(+{result.coins} Coins)</span> : null}
        </div>
      )}

      <style>{`
        .spin{ display:flex; flex-direction:column; gap:12px; }
        .row{ display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:end;
              background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06);
              border-radius:12px; padding:10px; }
        .wheelWrap{ position:relative; display:grid; place-items:center; }
        .pointer{
          position:absolute; top:-2px; left:50%; transform:translateX(-50%);
          color:#ffd47a; font-weight:900; text-shadow:0 0 6px rgba(0,0,0,.4);
        }
        .result{ font-size:14px; }
        .ok{ color:#22c55e; }
        .primary{
          background:linear-gradient(90deg, #60a5fa, #22d3ee); color:#09121e; font-weight:700;
          border:none; padding:10px 14px; border-radius:10px; cursor:pointer; box-shadow:0 6px 18px rgba(34,211,238,.25);
        }
        .muted{ color:#9fb0c7; }
        .small{ font-size:12px; }
      `}</style>
    </div>
  );
}

/* ---------------- SVG helpers ---------------- */

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

// Draw a circular sector path (donut style with inner radius at 0)
function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const largeArc = end - start > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}
