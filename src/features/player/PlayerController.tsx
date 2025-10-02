// src/features/player/PlayerController.tsx
import { useEffect, useRef, useState } from "react";
import { type Collider } from "../campus/OutdoorWorld3D";

/**
 * Top-down 2D controller on XZ plane.
 * - WASD / Arrow keys
 * - Constant speed
 * - Collides against Box/Circle colliders
 * - Renders your avatar (children) at the player position
 */

type Vec2 = { x: number; z: number };

type Props = {
  start?: Vec2;
  speed?: number;      // meters per second
  radius?: number;     // player radius for collision
  colliders?: Collider[];
  onMove?: (pos: Vec2) => void;
  children?: React.ReactNode; // render your HeroRig3D here
};

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  radius = 0.45,
  colliders = [],
  onMove,
  children,
}: Props) {
  // Render state (only updated when position actually changes)
  const [renderPos, setRenderPos] = useState<Vec2>(start);

  // Internal refs so we keep a single, stable RAF loop
  const posRef = useRef<Vec2>(start);
  const keysRef = useRef<Record<string, boolean>>({});
  const collidersRef = useRef<Collider[]>(colliders);
  collidersRef.current = colliders;

  // Key handling (prevent page scroll on Arrow keys)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        k === "arrowup" ||
        k === "arrowdown" ||
        k === "arrowleft" ||
        k === "arrowright" ||
        k === " "
      ) {
        e.preventDefault();
      }
      keysRef.current[k] = true;
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down as any);
      window.removeEventListener("keyup", up as any);
    };
  }, []);

  // Single RAF loop
  useEffect(() => {
    let last = performance.now();
    let raf = 0;

    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;

      let vx = 0,
        vz = 0;
      const keys = keysRef.current;

      if (keys["w"] || keys["arrowup"]) vz -= 1;
      if (keys["s"] || keys["arrowdown"]) vz += 1;
      if (keys["a"] || keys["arrowleft"]) vx -= 1;
      if (keys["d"] || keys["arrowright"]) vx += 1;

      if (vx !== 0 || vz !== 0) {
        const mag = Math.hypot(vx, vz) || 1;
        vx = (vx / mag) * speed * dt;
        vz = (vz / mag) * speed * dt;

        const p = posRef.current;
        let nx = p.x + vx;
        let nz = p.z;

        // collide X
        if (intersects({ x: nx, z: nz }, radius, collidersRef.current)) {
          nx = p.x;
        }
        // then Z
        nz = p.z + vz;
        if (intersects({ x: nx, z: nz }, radius, collidersRef.current)) {
          nz = p.z;
        }

        if (nx !== p.x || nz !== p.z) {
          const np = { x: nx, z: nz };
          posRef.current = np;
          setRenderPos(np);
          onMove?.(np);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onMove, radius, speed]);

  return (
    <group position={[renderPos.x, 0, renderPos.z]}>
      {/* If you pass your avatar as children, it renders here.
          Otherwise show a small fallback capsule. */}
      {children ?? (
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 0.9, 16]} />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
      )}
    </group>
  );
}

/* -------- collision helpers -------- */

function intersects(p: { x: number; z: number }, r: number, cs: Collider[]) {
  for (const c of cs) {
    if (c.kind === "circle") {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (dx * dx + dz * dz < (r + c.r) * (r + c.r)) return true;
    } else {
      // box: axis-aligned
      const hw = c.w / 2;
      const hd = c.d / 2;
      const cx = clamp(p.x, c.x - hw, c.x + hw);
      const cz = clamp(p.z, c.z - hd, c.z + hd);
      const dx = p.x - cx;
      const dz = p.z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
  }
  return false;
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
