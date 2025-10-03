// src/features/player/PlayerController.tsx
import { useEffect, useRef } from "react";
import { Group, Object3D } from "three";
import { useFrame } from "@react-three/fiber";
import type { Collider } from "../campus/OutdoorWorld3D";

type Vec2 = { x: number; z: number };

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  radius = 0.45,
  colliders = [],
  nodeRef,                 // external ref used by FollowCam
  inputDirRef,             // OPTIONAL: pass a ref with {x,z} ∈ [-1,1] from a thumbstick
  onMove,
  children,
}: {
  start?: Vec2;
  speed?: number;
  radius?: number;
  colliders?: Collider[];
  nodeRef?: React.MutableRefObject<Object3D | null>;
  inputDirRef?: React.MutableRefObject<Vec2 | null>;
  onMove?: (pos: Vec2) => void;
  children?: React.ReactNode;
}) {
  // The moving group
  const localRef = useRef<Group>(null);
  const ref = (nodeRef as React.MutableRefObject<Group | null>) ?? localRef;

  // position kept in a ref (no React state = no re-renders)
  const pos = useRef<Vec2>({ ...start });
  const keys = useRef<Record<string, boolean>>({});

  // ---------------- Keyboard ----------------
  useEffect(() => {
    const watch = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);

    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (watch.has(k)) e.preventDefault();

      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable)) return;

      keys.current[k] = true;
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (watch.has(k)) e.preventDefault();
      keys.current[k] = false;
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // ---------------- Initial placement ----------------
  useEffect(() => {
    if (ref.current) ref.current.position.set(start.x, 0, start.z);
    pos.current = { ...start };
    onMove?.({ ...start });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- Per-frame update ----------------
  useFrame((_state, rawDt) => {
    const g = ref.current;
    if (!g) return;

    // Clamp dt to avoid big jumps (e.g., tab swaps)
    const dt = Math.min(0.05, Math.max(0, rawDt)); // <= 50 ms

    // 1) Gather input (keyboard)
    let ix = 0, iz = 0;
    const k = keys.current;
    if (k["w"] || k["arrowup"])    iz -= 1;
    if (k["s"] || k["arrowdown"])  iz += 1;
    if (k["a"] || k["arrowleft"])  ix -= 1;
    if (k["d"] || k["arrowright"]) ix += 1;

    // 2) Optional thumbstick overrides when active
    if (inputDirRef && inputDirRef.current) {
      const stick = inputDirRef.current;
      const sMag = Math.hypot(stick.x, stick.z);
      if (sMag > 0.02) { // small deadzone
        ix = stick.x;
        iz = stick.z;
      }
    }

    // 3) Normalize input
    const mag = Math.hypot(ix, iz);
    if (mag < 1e-6) {
      // No intent -> do nothing (critically, do NOT rewrite position)
      return;
    }
    ix /= mag;
    iz /= mag;

    // 4) Integrate desired move
    const stepX = ix * speed * dt;
    const stepZ = iz * speed * dt;

    let nx = pos.current.x + stepX;
    let nz = pos.current.z;

    if (intersects(nx, nz, radius, colliders)) {
      nx = pos.current.x; // block X
    }
    nz = pos.current.z + stepZ;
    if (intersects(nx, nz, radius, colliders)) {
      nz = pos.current.z; // block Z
    }

    // 5) Only write when something actually changed by epsilon
    const EPS = 1e-6;
    if (Math.abs(nx - pos.current.x) > EPS || Math.abs(nz - pos.current.z) > EPS) {
      pos.current.x = nx;
      pos.current.z = nz;
      g.position.set(nx, 0, nz);
      onMove?.({ x: nx, z: nz });
    }
  });

  return (
    <group ref={ref}>
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
