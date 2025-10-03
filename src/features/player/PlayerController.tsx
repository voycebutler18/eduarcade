// src/features/player/PlayerController.tsx
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { ReactNode } from "react";
import { Collider } from "../campus/OutdoorWorld3D";

type Vec2 = { x: number; z: number };

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  radius = 0.45,
  colliders = [],
  onMove,
  nodeRef,
  inputDirRef, // <- external analog stick dir {x,z} | null
  children,
}: {
  start?: Vec2;
  speed?: number;
  radius?: number;
  colliders?: Collider[];
  onMove?: (pos: Vec2) => void;
  nodeRef?: React.RefObject<THREE.Object3D>;
  inputDirRef?: React.RefObject<{ x: number; z: number } | null>;
  children?: ReactNode;
}) {
  const localRef = useRef<THREE.Group>(null);
  const groupRef = nodeRef ?? localRef;

  const posRef = useRef<Vec2>({ ...start });
  const velRef = useRef<Vec2>({ x: 0, z: 0 });
  const keys = useRef<Record<string, boolean>>({});

  // initialize position once
  useEffect(() => {
    posRef.current = { ...start };
    velRef.current = { x: 0, z: 0 };
    if (groupRef.current) groupRef.current.position.set(start.x, 0, start.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard
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

  // Movement loop
  useEffect(() => {
    let last = performance.now();
    let raf = 0;

    const ACCEL = 40; // smoothing
    const DECEL = 35;

    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // 1) read keyboard intent
      let kx = 0, kz = 0;
      const k = keys.current;
      if (k["w"] || k["arrowup"])    kz -= 1;
      if (k["s"] || k["arrowdown"])  kz += 1;
      if (k["a"] || k["arrowleft"])  kx -= 1;
      if (k["d"] || k["arrowright"]) kx += 1;

      // 2) merge with thumbstick (if present)
      let ix = kx, iz = kz;
      if (inputDirRef?.current) {
        // if stick magnitude is stronger than tiny keyboard tap, use it
        const sm = Math.hypot(inputDirRef.current.x, inputDirRef.current.z);
        if (sm > 0.05) {
          ix = inputDirRef.current.x;
          iz = inputDirRef.current.z;
        }
      }

      // normalize
      const mag = Math.hypot(ix, iz);
      const dirX = mag ? ix / mag : 0;
      const dirZ = mag ? iz / mag : 0;

      // 3) smooth velocity
      const targetVx = dirX * speed;
      const targetVz = dirZ * speed;

      velRef.current.x += (targetVx - velRef.current.x) * ACCEL * dt;
      velRef.current.z += (targetVz - velRef.current.z) * ACCEL * dt;

      if (!mag) {
        velRef.current.x *= Math.exp(-DECEL * dt);
        velRef.current.z *= Math.exp(-DECEL * dt);
      }

      // 4) integrate position
      let nx = posRef.current.x + velRef.current.x * dt;
      let nz = posRef.current.z + velRef.current.z * dt;
      nx = +nx.toFixed(5);
      nz = +nz.toFixed(5);

      // 5) collision (AABB / circle)
      if (intersects({ x: nx, z: nz }, radius, colliders)) {
        nx = posRef.current.x;
        nz = posRef.current.z;
        velRef.current.x = 0;
        velRef.current.z = 0;
      }

      // 6) apply
      if (nx !== posRef.current.x || nz !== posRef.current.z) {
        posRef.current.x = nx;
        posRef.current.z = nz;
        if (groupRef.current) groupRef.current.position.set(nx, 0, nz);
        onMove?.({ x: nx, z: nz });
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [speed, radius, colliders, onMove, inputDirRef, groupRef]);

  return (
    <group ref={groupRef as React.RefObject<THREE.Group>}>
      {/* Fallback capsule if no avatar passed */}
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
