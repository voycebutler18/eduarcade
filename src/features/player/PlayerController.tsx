// src/features/player/PlayerController.tsx
import { useEffect, useMemo, useRef } from "react";
import { Group, Object3D } from "three";
import { useFrame } from "@react-three/fiber";
import type { Collider } from "../campus/OutdoorWorld3D";

/**
 * Jitter-free, fixed-timestep top-down controller (XZ plane)
 * - Keyboard (WASD / Arrow keys)
 * - Optional on-screen stick via inputDirRef {x,z} in [-1,1]
 * - Only updates Object3D when position actually changes (epsilon)
 */

type Vec2 = { x: number; z: number };
type DirRef = React.MutableRefObject<{ x: number; z: number } | null>;

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  radius = 0.45,
  colliders = [],
  nodeRef,
  inputDirRef,         // <- optional thumbstick direction
  onMove,
  children,
}: {
  start?: Vec2;
  speed?: number;
  radius?: number;
  colliders?: Collider[];
  nodeRef?: React.MutableRefObject<Object3D | null>;
  inputDirRef?: DirRef;
  onMove?: (pos: Vec2) => void;
  children?: React.ReactNode;
}) {
  const localRef = useRef<Group>(null);
  const ref = nodeRef ?? localRef;

  const pos = useRef<Vec2>({ ...start });
  const placedOnce = useRef(false);
  const keys = useRef<Record<string, boolean>>({});

  const EPS = 1e-5;
  const STEP = 1 / 120; // fixed integration step (seconds)
  const acc = useRef(0);

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const wanted = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (wanted.has(k)) e.preventDefault();
      // ignore typing fields
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable)) return;
      keys.current[k] = true;
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (wanted.has(k)) e.preventDefault();
      keys.current[k] = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up, { passive: false });
    return () => {
      window.removeEventListener("keydown", down as any);
      window.removeEventListener("keyup", up as any);
    };
  }, []);

  /* ---------------- helpers ---------------- */

  function readInput(): Vec2 {
    // keyboard
    let x = 0, z = 0;
    const k = keys.current;
    if (k["w"] || k["arrowup"]) z -= 1;
    if (k["s"] || k["arrowdown"]) z += 1;
    if (k["a"] || k["arrowleft"]) x -= 1;
    if (k["d"] || k["arrowright"]) x += 1;

    // stick (override keyboard if present)
    const s = inputDirRef?.current;
    if (s) {
      x = s.x;
      z = s.z;
    }

    const m = Math.hypot(x, z);
    return m > 0 ? { x: x / m, z: z / m } : { x: 0, z: 0 };
  }

  function tryMove(cur: Vec2, dx: number, dz: number): Vec2 {
    let nx = cur.x + dx;
    let nz = cur.z;
    if (intersects(nx, nz, radius, colliders)) nx = cur.x;
    nz = cur.z + dz;
    if (intersects(nx, nz, radius, colliders)) nz = cur.z;
    return { x: nx, z: nz };
  }

  /* ---------------- mount ---------------- */

  useEffect(() => {
    pos.current = { ...start };
    if (ref.current) ref.current.position.set(start.x, 0, start.z);
    placedOnce.current = true;
    onMove?.({ ...start });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- main loop (fixed timestep) ---------------- */

  useFrame((_state, dt) => {
    // place once if object just appeared
    if (!placedOnce.current && ref.current) {
      ref.current.position.set(pos.current.x, 0, pos.current.z);
      placedOnce.current = true;
    }

    // clamp dt and accumulate
    acc.current += Math.min(0.05, Math.max(0, dt));

    let moved = false;
    while (acc.current >= STEP) {
      acc.current -= STEP;

      const dir = readInput();
      if (dir.x !== 0 || dir.z !== 0) {
        const dx = dir.x * speed * STEP;
        const dz = dir.z * speed * STEP;
        const next = tryMove(pos.current, dx, dz);

        if (Math.abs(next.x - pos.current.x) > EPS || Math.abs(next.z - pos.current.z) > EPS) {
          pos.current = next;
          moved = true;
        }
      }
    }

    if (moved && ref.current) {
      ref.current.position.set(pos.current.x, 0, pos.current.z);
      onMove?.({ ...pos.current });
    }
  });

  /* ---------------- render ---------------- */

  return (
    <group ref={ref as React.MutableRefObject<Group | null>}>
      {children ?? (
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 0.9, 12]} />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
      )}
    </group>
  );
}

/* ------------- collision ------------- */

function intersects(x: number, z: number, r: number, cs: Collider[]) {
  for (const c of cs) {
    if (c.kind === "circle") {
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (r + c.r) * (r + c.r)) return true;
    } else {
      const hw = c.w / 2, hd = c.d / 2;
      const cx = clamp(x, c.x - hw, c.x + hw);
      const cz = clamp(z, c.z - hd, c.z + hd);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
  }
  return false;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
