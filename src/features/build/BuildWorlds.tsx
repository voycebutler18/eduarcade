// src/features/build/BuildWorlds.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "../../state/wallet";

/**
 * BuildWorlds with coin economy:
 * - Charge when placing non-empty onto empty.
 * - Refund when placing empty onto non-empty (erase).
 * - Repainting non-empty to non-empty is free (MVP).
 */

type TileType = 0 | 1 | 2 | 3 | 4 | 5;
// 0 Empty, 1 Block, 2 Hazard, 3 Coin, 4 Spawn, 5 Goal

const TILE_COLORS: Record<TileType, string> = {
  0: "#0b1220",
  1: "#334155",
  2: "#ef4444",
  3: "#f59e0b",
  4: "#22d3ee",
  5: "#22c55e",
};

const TILE_LABEL: Record<TileType, string> = {
  0: "Empty",
  1: "Block",
  2: "Hazard",
  3: "Coin",
  4: "Spawn",
  5: "Goal",
};

/** Placement / refund values */
const TILE_COST: Record<TileType, number> = {
  0: 0,   // erase
  1: 5,   // Block
  2: 10,  // Hazard
  3: 2,   // Coin
  4: 0,   // Spawn
  5: 0,   // Goal
};

const W = 20;
const H = 12;
const PX = 24;

type MapGrid = TileType[];
type Mode = "edit" | "play";

export default function BuildWorlds() {
  const [grid, setGrid] = useState<MapGrid>(() => starterGrid());
  const [tool, setTool] = useState<TileType>(1);
  const [mode, setMode] = useState<Mode>("edit");
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  const wallet = useWallet();
  const balance = wallet.coins;

  // toast
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 2500);
  }

  // playtest state
  const [coinsCollected, setCoinsCollected] = useState(0);
  const [status, setStatus] = useState<"idle" | "win" | "fail">("idle");
  const coinTotal = useMemo(() => grid.filter((t) => t === 3).length, [grid]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render grid
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W * PX, H * PX);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = grid[idx(x, y)];
        ctx.fillStyle = TILE_COLORS[t];
        ctx.fillRect(x * PX, y * PX, PX, PX);

        // subtle grid
        ctx.strokeStyle = "rgba(255,255,255,.06)";
        ctx.strokeRect(x * PX, y * PX, PX, PX);

        // coin glyph
        if (t === 3) {
          ctx.fillStyle = "#fff4cc";
          ctx.beginPath();
          ctx.arc(x * PX + PX / 2, y * PX + PX / 2, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#b08900";
          ctx.fillRect(x * PX + PX / 2 - 2, y * PX + PX / 2 - 6, 4, 12);
        }
        // hazard glyph
        if (t === 2) {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(x * PX + 6, y * PX + PX - 6);
          ctx.lineTo(x * PX + PX / 2, y * PX + 6);
          ctx.lineTo(x * PX + PX - 6, y * PX + PX - 6);
          ctx.closePath();
          ctx.fill();
        }
        // spawn/goal marker
        if (t === 4 || t === 5) {
          ctx.fillStyle = t === 4 ? "#bdf8ff" : "#b9f6c4";
          ctx.fillRect(x * PX + 6, y * PX + 6, PX - 12, PX - 12);
        }
      }
    }

    if (hover) {
      ctx.strokeStyle = "rgba(96,165,250,.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(hover.x * PX + 1, hover.y * PX + 1, PX - 2, PX - 2);
    }
  }, [grid, hover]);

  function onCanvasPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * W);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * H);
    if (x < 0 || y < 0 || x >= W || y >= H) {
      setHover(null);
      return;
    }
    setHover({ x, y });
    if (e.buttons === 1 && mode === "edit") {
      paintWithEconomy(x, y, tool);
    }
  }

  /**
   * Economy rules:
   * - Charge if prev=Empty and new!=Empty -> spend(cost[new])
   * - Refund if prev!=Empty and new=Empty -> grant(cost[prev])
   * - Otherwise (repaint, empty->empty), free
   * - Spawn/Goal cost 0 so they neither charge nor refund
   */
  function paintWithEconomy(x: number, y: number, t: TileType) {
    setGrid((g) => {
      const i = idx(x, y);
      const prev = g[i];
      if (prev === t) return g;

      let next = [...g];

      // Unique Spawn/Goal
      if (t === 4) {
        const prevSpawn = next.findIndex((v) => v === 4);
        if (prevSpawn !== -1) next[prevSpawn] = 0;
      }
      if (t === 5) {
        const prevGoal = next.findIndex((v) => v === 5);
        if (prevGoal !== -1) next[prevGoal] = 0;
      }

      // Refund path: non-empty -> empty
      if (prev !== 0 && t === 0) {
        const refund = TILE_COST[prev] ?? 0;
        if (refund > 0) {
          wallet.grant(refund);
          showToast(`Removed ${TILE_LABEL[prev]} (+${refund}). Balance: ${wallet.format()}`);
        }
        next[i] = t;
        return next;
      }

      // Charge path: empty -> non-empty
      if (prev === 0 && t !== 0) {
        const cost = TILE_COST[t] ?? 0;
        if (cost > 0) {
          const ok = wallet.spend(cost);
          if (!ok) {
            showToast(`Not enough coins to place ${TILE_LABEL[t]} (cost ${cost}).`);
            return g;
          }
          showToast(`Placed ${TILE_LABEL[t]} (−${cost}). Balance: ${wallet.format()}`);
        }
        next[i] = t;
        return next;
      }

      // Repaint non-empty -> non-empty (free, MVP)
      next[i] = t;
      return next;
    });
  }

  function floodFill(x: number, y: number, target: TileType, replacement: TileType) {
    if (target === replacement) return;

    // Two charge/refund cases:
    // A) empty -> non-empty : charge cells * cost(replacement)
    // B) non-empty -> empty : refund cells * cost(target)
    const goingToEmpty = replacement === 0;
    const comingFromEmpty = target === 0;

    const unitValue =
      comingFromEmpty && !goingToEmpty ? (TILE_COST[replacement] ?? 0) :
      !comingFromEmpty && goingToEmpty ? (TILE_COST[target] ?? 0) :
      0;

    const isEconomy = unitValue > 0 && (comingFromEmpty !== goingToEmpty); // exactly one of the two

    setGrid((g) => {
      const arr = [...g];
      const seen = new Set<string>();
      const q: Array<{ x: number; y: number }> = [{ x, y }];

      // If we will charge/refund, pre-count cells
      let cells = 0;
      if (isEconomy) {
        const seen2 = new Set<string>();
        const q2 = [{ x, y }];
        while (q2.length) {
          const n = q2.pop()!;
          const id2 = `${n.x},${n.y}`;
          if (seen2.has(id2)) continue;
          seen2.add(id2);
          const i2 = idx(n.x, n.y);
          if (arr[i2] !== target) continue;
          cells++;
          if (n.x > 0) q2.push({ x: n.x - 1, y: n.y });
          if (n.x < W - 1) q2.push({ x: n.x + 1, y: n.y });
          if (n.y > 0) q2.push({ x: n.x, y: n.y - 1 });
          if (n.y < H - 1) q2.push({ x: n.x, y: n.y + 1 });
        }

        const total = unitValue * cells;
        if (total > 0) {
          if (comingFromEmpty) {
            // charge
            if (!wallet.spend(total)) {
              showToast(`Need ${total} coins to fill with ${TILE_LABEL[replacement]}. Balance: ${wallet.format()}`);
              return g;
            }
            showToast(`Fill placed ${cells} tiles (−${total}). Balance: ${wallet.format()}`);
          } else {
            // refund
            wallet.grant(total);
            showToast(`Removed ${cells} tiles (+${total}). Balance: ${wallet.format()}`);
          }
        }
      }

      // Apply fill
      while (q.length) {
        const n = q.pop()!;
        const id = `${n.x},${n.y}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const i = idx(n.x, n.y);
        if (arr[i] !== target) continue;

        // maintain uniqueness for spawn/goal
        if (replacement === 4) {
          const prevSpawn = arr.findIndex((v) => v === 4);
          if (prevSpawn !== -1) arr[prevSpawn] = 0;
        }
        if (replacement === 5) {
          const prevGoal = arr.findIndex((v) => v === 5);
          if (prevGoal !== -1) arr[prevGoal] = 0;
        }

        arr[i] = replacement;

        if (n.x > 0) q.push({ x: n.x - 1, y: n.y });
        if (n.x < W - 1) q.push({ x: n.x + 1, y: n.y });
        if (n.y > 0) q.push({ x: n.x, y: n.y - 1 });
        if (n.y < H - 1) q.push({ x: n.x, y: n.y + 1 });
      }

      return arr;
    });
  }

  // Export / Import JSON
  function exportJSON() {
    const data = JSON.stringify({ W, H, grid }, null, 2);
    download("eduverse-map.json", data);
  }
  function importJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!Array.isArray(obj.grid) || obj.grid.length !== W * H) {
          alert("Invalid map file.");
          return;
        }
        setGrid(obj.grid.map((n: number) => clampTile(n)) as MapGrid);
      } catch {
        alert("Could not parse map file.");
      }
    };
    reader.readAsText(file);
  }

  // Playtest
  const [player, setPlayer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  function startPlay() {
    const s = spawnOf(grid) ?? { x: 1, y: 1 };
    setPlayer(s);
    setCoinsCollected(0);
    setStatus("idle");
    setMode("play");
  }

  useEffect(() => {
    if (mode !== "play") return;

    function onKey(e: KeyboardEvent) {
      const dir = keyToDir(e.key);
      if (!dir) return;
      e.preventDefault();
      setPlayer((p) => {
        const nx = clamp(p.x + dir.dx, 0, W - 1);
        const ny = clamp(p.y + dir.dy, 0, H - 1);
        const t = grid[idx(nx, ny)];
        if (t === 1) return p; // block blocks

        const np = { x: nx, y: ny };

        if (t === 2) setStatus("fail");   // hazard -> fail
        if (t === 3) {                    // coin -> collect
          setGrid((g) => {
            const next = [...g];
            next[idx(nx, ny)] = 0;
            return next;
          });
          setCoinsCollected((c) => c + 1);
        }
        if (t === 5) setStatus("win");    // goal -> win

        return np;
      });
    }
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, grid]);

  // Draw player overlay
  useEffect(() => {
    if (mode !== "play") return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = grid[idx(x, y)];
        ctx.fillStyle = TILE_COLORS[t];
        ctx.fillRect(x * PX, y * PX, PX, PX);
        ctx.strokeStyle = "rgba(255,255,255,.06)";
        ctx.strokeRect(x * PX, y * PX, PX, PX);

        if (t === 3) {
          ctx.fillStyle = "#fff4cc";
          ctx.beginPath();
          ctx.arc(x * PX + PX / 2, y * PX + PX / 2, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#b08900";
          ctx.fillRect(x * PX + PX / 2 - 2, y * PX + PX / 2 - 6, 4, 12);
        }
        if (t === 2) {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(x * PX + 6, y * PX + PX - 6);
          ctx.lineTo(x * PX + PX / 2, y * PX + 6);
          ctx.lineTo(x * PX + PX - 6, y * PX + PX - 6);
          ctx.closePath();
          ctx.fill();
        }
        if (t === 4 || t === 5) {
          ctx.fillStyle = t === 4 ? "#bdf8ff" : "#b9f6c4";
          ctx.fillRect(x * PX + 6, y * PX + 6, PX - 12, PX - 12);
        }
      }
    }
    ctx.fillStyle = "#60a5fa";
    ctx.beginPath();
    ctx.arc(player.x * PX + PX / 2, player.y * PX + PX / 2, 8, 0, Math.PI * 2);
    ctx.fill();
  }, [player, mode, grid]);

  return (
    <div className="builder">
      <div className="bar">
        <div className="left">
          <h3 style={{ margin: 0 }}>Build Worlds</h3>
          <div className="muted small">
            {mode === "edit" ? "Edit mode — click to paint. Drag to draw." : "Playtest — WASD/Arrow keys to move."}
          </div>
        </div>
        <div className="right">
          <div className="wallet">
            <span className="muted small">Balance</span>
            <span className="cash">{wallet.format(balance)}c</span>
          </div>

          <select
            className="inp"
            value={tool}
            onChange={(e) => setTool(Number(e.target.value) as TileType)}
            disabled={mode === "play"}
            title="Tool / Tile"
          >
            <option value={1}>Block (±{TILE_COST[1]})</option>
            <option value={2}>Hazard (±{TILE_COST[2]})</option>
            <option value={3}>Coin (±{TILE_COST[3]})</option>
            <option value={4}>Spawn (free)</option>
            <option value={5}>Goal (free)</option>
            <option value={0}>Empty (erase → refund)</option>
          </select>

          <button className="ghost" disabled={mode === "play"} onClick={() => setGrid(starterGrid())}>
            Clear
          </button>
          <button
            className="ghost"
            disabled={mode === "play" || !hover}
            onClick={() => hover && floodFill(hover.x, hover.y, grid[idx(hover.x, hover.y)], tool)}
          >
            Fill
          </button>

          {mode === "edit" ? (
            <button className="primary" onClick={startPlay}>
              Playtest
            </button>
          ) : (
            <button className="primary" onClick={() => setMode("edit")}>
              Back to Edit
            </button>
          )}

          <button className="ghost" disabled={mode === "play"} onClick={exportJSON}>
            Export
          </button>
          <label className="ghost up">
            Import
            <input
              type="file"
              accept="application/json"
              onChange={(e) => e.target.files && importJSON(e.target.files[0])}
              hidden
            />
          </label>
        </div>
      </div>

      <div className="canvasWrap" onContextMenu={(e) => e.preventDefault()}>
        <canvas
          ref={canvasRef}
          width={W * PX}
          height={H * PX}
          onPointerMove={onCanvasPointer}
          onPointerDown={onCanvasPointer}
          style={{ width: "100%", imageRendering: "pixelated", borderRadius: 12, border: "1px solid rgba(255,255,255,.08)" }}
        />
      </div>

      {/* Status row */}
      <div className="status">
        {mode === "play" ? (
          status === "win" ? (
            <span className="ok">You win! 🎉</span>
          ) : status === "fail" ? (
            <span className="danger">Ouch! Hazard hit. 💥</span>
          ) : (
            <span>Coins: {coinsCollected}/{coinTotal}</span>
          )
        ) : (
          <span>Tip: Place <b>Spawn</b> and <b>Goal</b>. Coins are optional.</span>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      <style>{`
        .builder{ display:flex; flex-direction:column; gap:12px; }
        .bar{
          display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:end;
          background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06);
          border-radius:12px; padding:10px;
        }
        .right{ display:flex; gap:8px; align-items:center; flex-wrap: wrap; }
        .wallet{
          display:flex; flex-direction:column; align-items:flex-end; gap:2px;
          background:#0b1222; border:1px solid rgba(255,255,255,.08);
          border-radius:10px; padding:6px 8px; min-width:96px;
        }
        .cash{ color:#ffd47a; font-weight:800; }
        .inp{
          background:#121a2c; color:#e6edf7; border-radius:10px;
          border:1px solid rgba(255,255,255,.08); padding:8px 10px; min-height:38px;
        }
        .ghost{
          background:transparent; border:1px solid rgba(255,255,255,.12);
          color:#e6edf7; border-radius:10px; padding:8px 12px; cursor:pointer;
          display:inline-flex; align-items:center; gap:8px;
        }
        .ghost.up{ position:relative; overflow:hidden; }
        .ghost.up input{ position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
        .primary{
          background:linear-gradient(90deg, #60a5fa, #22d3ee); color:#09121e; font-weight:700;
          border:none; padding:10px 14px; border-radius:10px; cursor:pointer; box-shadow:0 6px 18px rgba(34,211,238,.25);
        }
        .canvasWrap{ display:grid; }
        .status{ color:#9fb0c7; font-size:12px; }
        .ok{ color:#22c55e; }
        .danger{ color:#ef4444; }
        .toast{
          position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
          background: #0b1222; color:#e6edf7; border:1px solid rgba(255,255,255,.12);
          padding:10px 12px; border-radius:10px; box-shadow: 0 12px 40px rgba(0,0,0,.4);
          z-index: 60; max-width: 90%;
        }
      `}</style>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function idx(x: number, y: number) {
  return y * W + x;
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function clampTile(n: number): TileType {
  return [0, 1, 2, 3, 4, 5].includes(n) ? (n as TileType) : 0;
}
function starterGrid(): MapGrid {
  const g: TileType[] = new Array(W * H).fill(0);
  for (let x = 0; x < W; x++) g[idx(x, H - 1)] = 1;
  g[idx(2, H - 2)] = 4;           // spawn
  g[idx(W - 3, H - 2)] = 5;       // goal
  g[idx(8, H - 2)] = 3;           // coin
  g[idx(9, H - 2)] = 3;           // coin
  g[idx(10, H - 2)] = 2;          // hazard
  return g;
}
function keyToDir(key: string) {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return { dx: 0, dy: -1 };
    case "ArrowDown":
    case "s":
    case "S":
      return { dx: 0, dy: 1 };
    case "ArrowLeft":
    case "a":
    case "A":
      return { dx: -1, dy: 0 };
    case "ArrowRight":
    case "d":
    case "D":
      return { dx: 1, dy: 0 };
    default:
      return null;
  }
}
function spawnOf(g: MapGrid): { x: number; y: number } | null {
  const i = g.findIndex((t) => t === 4);
  if (i === -1) return null;
  return { x: i % W, y: Math.floor(i / W) };
}
function download(filename: string, text: string) {
  const a = document.createElement("a");
  const file = new Blob([text], { type: "application/json" });
  a.href = URL.createObjectURL(file);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
