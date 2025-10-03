import * as THREE from "three";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Collider } from "../campus/OutdoorWorld3D";

// Player position type
type Vec2 = { x: number; z: number };

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  radius = 0.45,
  colliders = [],
  onMove,
  nodeRef,
  children,
}: {
  start?: Vec2;
  speed?: number;
  radius?: number;
  colliders?: Collider[];
  onMove?: (pos: Vec2) => void;
  nodeRef?: React.RefObject<THREE.Object3D>;
  children?: ReactNode;
}) {
  const localRef = useRef<THREE.Group>(null);
  const groupRef = nodeRef ?? localRef;

  const posRef = useRef<Vec2>({ ...start });
  const velRef = useRef<Vec2>({ x: 0, z: 0 });
  const keys = useRef<Record<string, boolean>>({});

  // Initialize position on mount
  useEffect(() => {
    posRef.current = { ...start };
    velRef.current = { x: 0, z: 0 };
    if (groupRef.current) {
      groupRef.current.position.set(start.x, 0, start.z);
    }
  }, []); // mount

  // Keyboard input handlers
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

  // Smooth movement loop with velocity interpolation
  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const ACCEL = 40;
    const DECEL = 35;

    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000); // clamp large frames
      last = now;

      // Input
      let inputX = 0, inputZ = 0;
      const k = keys.current;
      if (k["w"] || k["arrowup"])    inputZ -= 1;
      if (k["s"] || k["arrowdown"])  inputZ += 1;
      if (k["a"] || k["arrowleft"])  inputX -= 1;
      if (k["d"] || k["arrowright"]) inputX += 1;

      // Normalize input direction
      const mag = Math.hypot(inputX, inputZ);
      let dirX = mag ? inputX / mag : 0;
      let dirZ = mag ? inputZ / mag : 0;

      // Target velocity based on direction
      const targetVx = dirX * speed;
      const targetVz = dirZ * speed;

      // Interpolate velocity for smooth acceleration/deceleration
      velRef.current.x += (targetVx - velRef.current.x) * ACCEL * dt;
      velRef.current.z += (targetVz - velRef.current.z) * ACCEL * dt;
      if (!mag) {
        velRef.current.x *= Math.exp(-DECEL * dt);
        velRef.current.z *= Math.exp(-DECEL * dt);
      }

      // Compute next position with clamped float precision
      let nx = posRef.current.x + velRef.current.x * dt;
      let nz = posRef.current.z + velRef.current.z * dt;
      nx = +nx.toFixed(5);
      nz = +nz.toFixed(5);

      // Collision
      if (intersects({ x: nx, z: nz }, radius, colliders)) {
        nx = posRef.current.x;
        nz = posRef.current.z;
        velRef.current.x = 0;
        velRef.current.z = 0;
      }

      // Update position
      if (nx !== posRef.current.x || nz !== posRef.current.z) {
        posRef.current = { x: nx, z: nz };
        if (groupRef.current) {
          groupRef.current.position.set(nx, 0, nz);
        }
        onMove?.({ x: nx, z: nz });
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [speed, radius, colliders, onMove, groupRef]);

  return (
    <group ref={groupRef as React.RefObject<THREE.Group>}>
      {/* fallback capsule if no children provided */}
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

/* ---- Collision helpers ---- */
function intersects(p: { x: number; z: number }, r: number, cs: Collider[]) {
  for (const c of cs) {
    if (c.kind === "circle") {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (dx * dx + dz * dz < (r + c.r) * (r + c.r)) return true;
    } else {
      // axis-aligned box
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
