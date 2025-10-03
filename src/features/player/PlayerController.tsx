// src/features/player/PlayerController.tsx
import { useEffect, useRef } from "react";
import { Group, Object3D } from "three";
import { useFrame } from "@react-three/fiber";
import type { Collider } from "../campus/OutdoorWorld3D";

/**
 * Jitter-free, fixed-timestep top-down controller (XZ plane)
 * - Keyboard (WASD / Arrow keys) via e.code (layout-safe)
 * - Optional on-screen stick via inputDirRef {x,z} in [-1,1]
 * - Collision against simple circle/box colliders
 * - Persistent facing: smooth yaw damping toward movement direction
 */

type Vec2 = { x: number; z: number };
type DirRef = React.MutableRefObject<{ x: number; z: number } | null>;

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  radius = 0.45,
  colliders = [],
  nodeRef,
  inputDirRef,         // <- optional thumbstick/virtual dir
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

  // keyboard state by e.code (layout-safe)
  const keys = useRef<Record<string, boolean>>({});

  // integrator
  const EPS = 1e-5;
  const STEP = 1 / 120; // fixed integration step (seconds)
  const acc = useRef(0);

  // facing (yaw) with smoothing toward latest input direction
  const yaw = useRef(0);
  const targetYaw = useRef<number | null>(null);

  /* ---------------- robust keyboard (arrows + WASD) ---------------- */
  useEffect(() => {
    const wanted = new Set([
      "KeyW", "KeyA", "KeyS", "KeyD",
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    ]);

    const down = (e: KeyboardEvent) => {
      // ignore typing fields
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable)) return;

      if (wanted.has(e.code)) {
        e.preventDefault(); // stop page scroll with arrows
        keys.current[e.code] = true;
      }
    };

    const up = (e: KeyboardEvent) => {
      if (wanted.has(e.code)) {
        e.preventDefault();
        keys.current[e.code] = false;
      }
    };

    const clear = () => {
      for (const k of wanted) keys.current[k] = false;
    };

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up, { passive: false });
    window.addEventListener("blur", clear);

    return () => {
      window.removeEventListener("keydown", down as any);
      window.removeEventListener("keyup", up as any);
      window.removeEventListener("blur", clear as any);
    };
  }, []);

  /* ---------------- helpers ---------------- */

  function readInput(): Vec2 {
    // keyboard
    let x = 0, z = 0;
    const k = keys.current;

    if (k["KeyW"] || k["ArrowUp"])    z -= 1;
    if (k["KeyS"] || k["ArrowDown"])  z += 1;
    if (k["KeyA"] || k["ArrowLeft"])  x -= 1;
    if (k["KeyD"] || k["ArrowRight"]) x += 1;

    // stick/virtual override if outside dead-zone
    const s = inputDirRef?.current;
    if (s) {
      const mag = Math.hypot(s.x, s.z);
      const DEAD = 0.18;
      if (mag > DEAD) {
        x = s.x / mag;
        z = s.z / mag;
      }
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

  // angle utilities
  const shortestAngle = (a: number, b: number) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  /* ---------------- mount ---------------- */

  useEffect(() => {
    pos.current = { ...start };
    if (ref.current) ref.current.position.set(start.x, 0, start.z);
    placedOnce.current = true;

    yaw.current = 0;          // start facing +Z
    targetYaw.current = null;

    onMove?.({ ...start });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- main loop (fixed timestep) ---------------- */

  useFrame((_state, dt) => {
    // ensure object is placed when it first appears
    if (!placedOnce.current && ref.current) {
      ref.current.position.set(pos.current.x, 0, pos.current.z);
      placedOnce.current = true;
    }

    const clamped = Math.min(0.05, Math.max(0, dt));
    acc.current += clamped;

    let moved = false;

    while (acc.current >= STEP) {
      acc.current -= STEP;

      const dir = readInput();
      if (dir.x !== 0 || dir.z !== 0) {
        // update facing target whenever we have input
        targetYaw.current = Math.atan2(dir.x, dir.z);

        const dx = dir.x * speed * STEP;
        const dz = dir.z * speed * STEP;
        const next = tryMove(pos.current, dx, dz);

        if (Math.abs(next.x - pos.current.x) > EPS || Math.abs(next.z - pos.current.z) > EPS) {
          pos.current = next;
          moved = true;
        }
      }
    }

    // smooth yaw toward target if present
    const DAMP = 16; // higher = snappier
    if (targetYaw.current !== null) {
      const d = shortestAngle(yaw.current, targetYaw.current);
      const t = 1 - Math.exp(-DAMP * clamped); // exponential smoothing
      yaw.current = yaw.current + d * t;
    }

    // apply transforms every frame (prevents snap-backs)
    if (ref.current) {
      if (moved) {
        ref.current.position.set(pos.current.x, 0, pos.current.z);
        onMove?.({ ...pos.current });
      }
      ref.current.rotation.y = yaw.current;
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
