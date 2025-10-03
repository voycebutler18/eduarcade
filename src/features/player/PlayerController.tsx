import * as THREE from "three";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Collider } from "../campus/OutdoorWorld3D";

/**
 * Top-down 2D controller on XZ plane (WASD/Arrows).
 * - One persistent RAF loop (no jitter)
 * - Uses refs for pos & keys (no re-subscribing)
 * - Collides against Box/Circle colliders
 * - Renders children under a movable group (so you can pass HeroRig3D)
 */
type Vec2 = { x: number; z: number };

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  radius = 0.45,
  colliders = [],
  onMove,
  nodeRef,       // optional external ref (e.g., for FollowCam)
  children,
}: {
  start?: Vec2;
  speed?: number;           // meters per second
  radius?: number;          // player radius for collision
  colliders?: Collider[];
  onMove?: (pos: Vec2) => void;
  nodeRef?: React.RefObject<THREE.Object3D>;
  children?: ReactNode;
}) {
  // Internal group ref if not provided
  const localRef = useRef<THREE.Group>(null);
  const groupRef = nodeRef ?? localRef;

  // Refs for runtime state (so effect deps can stay empty)
  const posRef = useRef<Vec2>({ ...start });
  const keys = useRef<Record<string, boolean>>({});

  // Initialize starting position on mount
  useEffect(() => {
    posRef.current = { ...start };
    if (groupRef.current) {
      groupRef.current.position.set(start.x, 0, start.z);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // Key handlers (prevent default on arrow keys to avoid page scroll)
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k.startsWith("arrow")) e.preventDefault();
      keys.current[k] = true;
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k.startsWith("arrow")) e.preventDefault();
      keys.current[k] = false;
    };
    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp, { passive: false });
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // Single RAF loop that moves the player and updates the group’s position
  useEffect(() => {
    let last = performance.now();
    let raf = 0;

    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000); // clamp big frames
      last = now;

      let vx = 0, vz = 0;
      const k = keys.current;
      if (k["w"] || k["arrowup"])    vz -= 1;
      if (k["s"] || k["arrowdown"])  vz += 1;
      if (k["a"] || k["arrowleft"])  vx -= 1;
      if (k["d"] || k["arrowright"]) vx += 1;

      if (vx || vz) {
        // normalize
        const mag = Math.hypot(vx, vz) || 1;
        vx = (vx / mag) * speed * dt;
        vz = (vz / mag) * speed * dt;

        const p = posRef.current;

        // Try X axis
        let nx = p.x + vx;
        let nz = p.z;
        if (intersects({ x: nx, z: nz }, radius, colliders)) {
          nx = p.x; // cancel X
        }

        // Then Z axis
        nz = p.z + vz;
        if (intersects({ x: nx, z: nz }, radius, colliders)) {
          nz = p.z; // cancel Z
        }

        if (nx !== p.x || nz !== p.z) {
          posRef.current = { x: nx, z: nz };
          if (groupRef.current) {
            groupRef.current.position.set(nx, 0, nz);
          }
          onMove?.({ x: nx, z: nz });
        }
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [speed, radius, colliders, onMove, groupRef]);

  return (
    <group ref={groupRef as React.RefObject<THREE.Group>} /* position controlled in RAF */>
      {/* visual capsule as a fallback if no children are provided */}
      {!children && (
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 0.9, 12]} />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
      )}
      {children}
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
