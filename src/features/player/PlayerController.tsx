// src/features/player/PlayerController.tsx
import { useEffect, useRef, useState } from "react";
import { Collider } from "../campus/OutdoorWorld3D";

/**
 * Top-down 2D controller on XZ plane.
 * - WASD / Arrow keys
 * - Constant speed
 * - Collides against Box/Circle colliders
 * - Renders children (your avatar) at the player position
 */

type Vec2 = { x: number; z: number };

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  radius = 0.45,
  colliders = [],
  onMove,
  children,
}: {
  start?: Vec2;
  speed?: number;     // meters per second
  radius?: number;    // player radius for collision
  colliders?: Collider[];
  onMove?: (pos: Vec2) => void;
  children?: React.ReactNode; // <<— render avatar here
}) {
  const [pos, setPos] = useState<Vec2>(start);
  const [heading, setHeading] = useState(0); // radians, rotate to face movement
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const down = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;

      let vx = 0, vz = 0;
      if (keys.current["w"] || keys.current["arrowup"]) vz -= 1;
      if (keys.current["s"] || keys.current["arrowdown"]) vz += 1;
      if (keys.current["a"] || keys.current["arrowleft"]) vx -= 1;
      if (keys.current["d"] || keys.current["arrowright"]) vx += 1;

      if (vx || vz) {
        const mag = Math.hypot(vx, vz) || 1;
        vx = (vx / mag) * speed * dt;
        vz = (vz / mag) * speed * dt;

        // try move X, then Z with collision
        let nx = pos.x + vx;
        let nz = pos.z;

        if (intersects({ x: nx, z: nz }, radius, colliders)) {
          nx = pos.x; // cancel X
        }
        // second axis
        nz = pos.z + vz;
        if (intersects({ x: nx, z: nz }, radius, colliders)) {
          nz = pos.z; // cancel Z
        }

        if (nx !== pos.x || nz !== pos.z) {
          const np = { x: nx, z: nz };
          setPos(np);
          onMove?.(np);
        }

        // face the direction of motion (atan2 on X/Z)
        const ang = Math.atan2(vx, -vz); // -vz because -Z is "forward" in our top-down
        setHeading(ang);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, speed, radius, colliders, onMove]);

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, heading, 0]}>
      {children ?? (
        // fallback capsule if no children passed
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 0.9, 12]} />
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
      // clamp point to box
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
