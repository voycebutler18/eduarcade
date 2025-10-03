// src/features/player/PlayerController.tsx
import { useEffect, useMemo, useRef } from "react";
import { Group, Object3D, Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import type { Collider } from "../campus/OutdoorWorld3D";

/**
 * Smooth, jitter-free top-down controller (XZ plane):
 * - WASD / Arrow keys (prevents page scroll)
 * - Uses useFrame (no per-tick React setState)
 * - Circle/Box collider support
 * - Renders children (your avatar) inside a moving Group
 */

type Vec2 = { x: number; z: number };

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  radius = 0.45,
  colliders = [],
  nodeRef,            // external ref used by FollowCam
  onMove,
  children,
}: {
  start?: Vec2;
  speed?: number;            // meters per second
  radius?: number;           // player radius for collision
  colliders?: Collider[];
  nodeRef?: React.MutableRefObject<Object3D | null>;
  onMove?: (pos: Vec2) => void;
  children?: React.ReactNode; // your avatar
}) {
  // The moving group
  const localRef = useRef<Group>(null);
  const ref = nodeRef ?? localRef;

  // position + velocity kept in refs (no React state = no jitter)
  const pos = useRef<Vec2>({ ...start });
  const keys = useRef<Record<string, boolean>>({});

  // helper vectors
  const vNext = useMemo(() => new Vector3(), []);
  const vTmp = useMemo(() => new Vector3(), []);

  /* ---------------- Keyboard ---------------- */

  useEffect(() => {
    const wants = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);

    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (wants.has(k)) {
        // avoid page scrolling / browser nav
        e.preventDefault();
      }
      // ignore typing in inputs
      const t = e.target as HTMLElement | null;
      const isTyping =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          (t as HTMLInputElement).isContentEditable);
      if (isTyping) return;

      keys.current[k] = true;
    };

    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (wants.has(k)) e.preventDefault();
      keys.current[k] = false;
    };

    // NB: keydown/keyup are non-passive by default, so preventDefault works
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  /* ---------------- Tick (useFrame) ---------------- */

  useFrame((_state, dt) => {
    const g = ref.current;
    if (!g) return;

    // read intent
    let vx = 0,
      vz = 0;
    if (keys.current["w"] || keys.current["arrowup"]) vz -= 1;
    if (keys.current["s"] || keys.current["arrowdown"]) vz += 1;
    if (keys.current["a"] || keys.current["arrowleft"]) vx -= 1;
    if (keys.current["d"] || keys.current["arrowright"]) vx += 1;

    if (vx !== 0 || vz !== 0) {
      // normalize + scale by speed * dt
      const mag = Math.hypot(vx, vz) || 1;
      vx = (vx / mag) * speed * dt;
      vz = (vz / mag) * speed * dt;

      // try X then Z with collision
      const cur = pos.current;

      let nx = cur.x + vx;
      let nz = cur.z;

      if (intersects(nx, nz, radius, colliders)) {
        nx = cur.x; // block X
      }
      nz = cur.z + vz;
      if (intersects(nx, nz, radius, colliders)) {
        nz = cur.z; // block Z
      }

      if (nx !== cur.x || nz !== cur.z) {
        cur.x = nx;
        cur.z = nz;

        // write to Three object directly (no React state)
        g.position.set(cur.x, 0, cur.z);
        onMove?.({ ...cur });
      }
    } else {
      // ensure initial placement
      const cur = pos.current;
      g.position.set(cur.x, 0, cur.z);
    }
  });

  /* ---------------- Mount: place at start ---------------- */

  useEffect(() => {
    if (ref.current) {
      ref.current.position.set(start.x, 0, start.z);
    }
    pos.current = { ...start };
    onMove?.({ ...start });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Render ---------------- */

  return (
    <group ref={ref as React.MutableRefObject<Group | null>}>
      {/* Your avatar goes here */}
      {children ?? (
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 0.9, 12]} />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
      )}
    </group>
  );
}

/* ---------------- Collision helpers ---------------- */

function intersects(x: number, z: number, r: number, cs: Collider[]) {
  for (const c of cs) {
    if (c.kind === "circle") {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (r + c.r) * (r + c.r)) return true;
    } else {
      // axis-aligned box
      const hw = c.w / 2;
      const hd = c.d / 2;
      const cx = clamp(x, c.x - hw, c.x + hw);
      const cz = clamp(z, c.z - hd, c.z + hd);
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
  }
  return false;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
