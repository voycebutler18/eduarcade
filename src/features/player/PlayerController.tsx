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
  inputDirRef,             // optional on-screen stick dir {x,z} in [-1,1]
  onMove,
  children,
}: {
  start?: Vec2;
  speed?: number;
  radius?: number;
  colliders?: Collider[];
  nodeRef?: React.MutableRefObject<Object3D | null>;
  inputDirRef?: React.MutableRefObject<{ x: number; z: number } | null>;
  onMove?: (pos: Vec2) => void;
  children?: React.ReactNode;
}) {
  const localRef = useRef<Group>(null);
  const ref = (nodeRef as React.MutableRefObject<Group | null>) ?? localRef;

  const pos = useRef<Vec2>({ ...start });
  const keys = useRef<Record<string, boolean>>({});

  /* ---------------- Keyboard ---------------- */
  useEffect(() => {
    const wants = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);

    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (wants.has(k)) e.preventDefault();
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as HTMLInputElement).isContentEditable)) return;
      keys.current[k] = true;
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (wants.has(k)) e.preventDefault();
      keys.current[k] = false;
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  /* ---------------- Mount: place at start ---------------- */
  useEffect(() => {
    if (ref.current) ref.current.position.set(start.x, 0, start.z);
    pos.current = { ...start };
    onMove?.({ ...start });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Per-frame step ---------------- */
  useFrame((_, rawDt) => {
    const g = ref.current;
    if (!g) return;

    // small cap on dt so a dropped frame doesn't tunnel through colliders
    const dt = Math.min(1 / 30, rawDt);

    // ---- input intent (keyboard + optional thumbstick)
    let ix = 0, iz = 0;
    if (keys.current["w"] || keys.current["arrowup"]) iz -= 1;
    if (keys.current["s"] || keys.current["arrowdown"]) iz += 1;
    if (keys.current["a"] || keys.current["arrowleft"]) ix -= 1;
    if (keys.current["d"] || keys.current["arrowright"]) ix += 1;

    if (inputDirRef?.current) {
      // If stick is present, it overrides keyboard when not zero.
      const sx = inputDirRef.current.x;
      const sz = inputDirRef.current.z;
      if (Math.abs(sx) > 0.01 || Math.abs(sz) > 0.01) {
        ix = sx;
        iz = sz;
      }
    }

    if (ix === 0 && iz === 0) return; // idle: don't rewrite same position -> no camera breathing

    // normalize
    const mag = Math.hypot(ix, iz) || 1;
    ix /= mag;
    iz /= mag;

    const stepX = ix * speed * dt;
    const stepZ = iz * speed * dt;

    const cur = pos.current;
    let nx = cur.x + stepX;
    let nz = cur.z;

    if (intersects(nx, nz, radius, colliders)) nx = cur.x;
    nz = cur.z + stepZ;
    if (intersects(nx, nz, radius, colliders)) nz = cur.z;

    if (nx !== cur.x || nz !== cur.z) {
      cur.x = nx;
      cur.z = nz;
      g.position.set(cur.x, 0, cur.z);
      onMove?.({ x: cur.x, z: cur.z });
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
