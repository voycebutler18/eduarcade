import { useEffect, useMemo, useRef, useState } from "react";

/**
 * BuildWorlds (MVP, panel-friendly)
 * - 2D tile editor rendered to a <canvas> (fast + cross-platform)
 * - Tile types: Empty, Block, Hazard, Coin, Spawn, Goal
 * - Tools: paint, erase, fill, pick, playtest
 * - Map size: 20 x 12 (fits panel); export/import JSON
 * - Playtest: keyboard arrows/WASD to move; reach Goal to win; touching Hazard fails; collect Coins
 *
 * This is intentionally self-contained so you can drop it in the Store/Play tab panel area.
 * Next step (later): publish maps to Supabase and share to private lobbies.
 */

type TileType = 0 | 1 | 2 | 3 | 4 | 5;
// 0 Empty, 1 Block (solid), 2 Hazard (fail), 3 Coin (collect), 4 Spawn, 5 Goal

const TILE_COLORS: Record<TileType, string> = {
  0: "#0b1220", // Empty
  1: "#334155", // Block
  2: "#ef4444", // Hazard
  3: "#f59e0b", // Coin
  4: "#22d3ee", // Spawn
  5: "#22c55e", // Goal
};

const TILE_LABEL: Record<TileType, string> = {
  0: "Empty",
  1: "Block",
  2: "Hazard",
  3: "Coin",
  4: "Spawn",
  5: "Goal",
};

const W = 20;
const H = 12;
const PX = 24; // tile pixel size

type MapGrid = TileType[]; // length = W * H
type Mode = "edit" | "play";

export default function BuildWorlds() {
  const [grid, setGrid] = useState<MapGrid>(() => starterGrid());
  const [tool, setTool] = useState<TileType>(1);
  const [mode, setMode] = useState<Mode>("edit");
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // playtest state
  const [coinsCollected, setCoinsCollected] = useState(0);
  const [status, setStatus] = useState<"idle" | "win" | "fail">("idle");

  const coinTotal = useMemo(() => grid.filter((t) => t === 3).length, [grid]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render grid to canvas
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

    // hover highlight
    if (hover) {
      ctx.strokeStyle = "rgba(96,165,250,.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(hover.x * PX + 1, hover.y * PX + 1, PX - 2, PX - 2);
    }
  }, [grid, hover]);

  function onCanvasPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * (W));
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * (H));
    if (x < 0 || y < 0 || x >= W || y >= H) {
      setHover(null);
      return;
    }
    setHover({ x, y });
    if (e.buttons === 1 && mode === "edit") {
      paint(x, y, tool);
    }
  }

  function paint(x: number, y: number, t: TileType) {
    setGrid((g) => {
      const next = [...g];
      // Only one Spawn and one Goal
      if (t === 4) {
        const prevSpawn = next.findIndex((v) => v === 4);
        if (prevSpawn !== -1) next[prevSpawn] = 0;
      }
      if (t === 5) {
        const prevGoal = next.findIndex((v) => v === 5);
        if (prevGoal !== -1) next[prevGoal] = 0;
      }
      next[idx(x, y)] = t;
      return next;
    });
  }

  function floodFill(x: number, y: number, target: TileType, replacement: TileType) {
    if (target === replacement) return;
    const q: Array<{ x: number; y: number }> = [{ x, y }];
    setGrid((g) => {
      const arr = [...g];
      const seen = new Set<string>();
      while (q.length) {
        const n = q.pop()!;
        const id = `${n.x},${n.y}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const i = idx(n.x, n.y);
        if (arr[i] !== target) continue;
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
        // Solid block blocks movement
        if (t === 1) return p;

        // Move
        const np = { x: nx, y: ny };

        // Hazard -> fail
        if (t === 2) {
          setStatus("fail");
        }

        // Coin -> collect
        if (t === 3) {
          setGrid((g) => {
            const next = [...g];
            next[idx(nx, ny)] = 0;
            return next;
          });
          setCoinsCollected((c) => c + 1);
        }

        // Goal -> win
        if (t === 5) {
          setStatus("win");
        }

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
    // redraw base
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
    // player
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
          <select
            className="inp"
            value={tool}
            onChange={(e) => setTool(Number(e.target.value) as TileType)}
            disabled={mode === "play"}
            title="Tool / Tile"
          >
            <option value={1}>Block</option>
            <option value={2}>Hazard</option>
            <option value={3}>Coin</option>
            <option value={4}>Spawn</option>
            <option value={5}>Goal</option>
            <option value={0}>Empty</option>
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

      <style>{`
        .builder{ display:flex; flex-direction:column; gap:12px; }
        .bar{
          display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:end;
          background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06);
          border-radius:12px; padding:10px;
        }
        .right{ display:flex; gap:8px; align-items:center; }
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
  // basic floor and a small platform, with a default spawn/goal
  const g: TileType[] = new Array(W * H).fill(0);
  for (let x = 0; x < W; x++) g[idx(x, H - 1)] = 1;
  g[idx(2, H - 2)] = 4; // spawn
  g[idx(W - 3, H - 2)] = 5; // goal
  g[idx(8, H - 2)] = 3; // coin
  g[idx(9, H - 2)] = 3; // coin
  g[idx(10, H - 2)] = 2; // hazard
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
