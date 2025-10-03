// src/features/player/PlayerController.tsx
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
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
  inputDirRef,
  children,
}: {
  start?: Vec2;
  speed?: number;
  radius?: number;
  colliders?: Collider[];
  onMove?: (pos: Vec2) => void;
  nodeRef?: React.MutableRefObject<THREE.Object3D | null>;
  inputDirRef?: React.MutableRefObject<Vec2 | null>;
  children?: ReactNode;
}) {
  const localRef = useRef<THREE.Group>(null);
  const groupRef = nodeRef ?? localRef;

  const posRef = useRef<Vec2>({ ...start });
  const velRef = useRef<Vec2>({ x: 0, z: 0 });
  const keys = useRef<Record<string, boolean>>({});

  // Constants for movement feel
  const ACCEL = 40;
  const DECEL = 35;

  // Initialize position on mount
  useEffect(() => {
    posRef.current = { ...start };
    velRef.current = { x: 0, z: 0 };
    if (groupRef.current) {
      groupRef.current.position.set(start.x, 0, start.z);
    }
    onMove?.({ ...start });
  }, [start.x, start.z]);

  // Keyboard input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keys.current[key] = true;
      
      if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        e.preventDefault();
      }
    };
    
    const up = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keys.current[key] = false;
      
      if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        e.preventDefault();
      }
    };
    
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Movement logic using useFrame (NOT requestAnimationFrame)
  useFrame((state, dt) => {
    if (!groupRef.current) return;

    // Gather input
    let ix = 0, iz = 0;
    const stick = inputDirRef?.current;
    
    if (stick && (Math.abs(stick.x) > 0.001 || Math.abs(stick.z) > 0.001)) {
      ix = stick.x;
      iz = stick.z;
    } else {
      if (keys.current["w"] || keys.current["arrowup"]) iz -= 1;
      if (keys.current["s"] || keys.current["arrowdown"]) iz += 1;
      if (keys.current["a"] || keys.current["arrowleft"]) ix -= 1;
      if (keys.current["d"] || keys.current["arrowright"]) ix += 1;
    }

    // Velocity interpolation
    const mag = Math.hypot(ix, iz);
    const dirX = mag ? ix / mag : 0;
    const dirZ = mag ? iz / mag : 0;
    const targetVx = dirX * speed;
    const targetVz = dirZ * speed;

    velRef.current.x += (targetVx - velRef.current.x) * ACCEL * dt;
    velRef.current.z += (targetVz - velRef.current.z) * ACCEL * dt;
    
    if (!mag) {
      velRef.current.x *= Math.exp(-DECEL * dt);
      velRef.current.z *= Math.exp(-DECEL * dt);
    }

    // Compute next position
    let nx = posRef.current.x + velRef.current.x * dt;
    let nz = posRef.current.z + velRef.current.z * dt;

    // Collisions
    if (intersects({ x: nx, z: nz }, radius, colliders)) {
      nx = posRef.current.x;
      nz = posRef.current.z;
      velRef.current.x = 0;
      velRef.current.z = 0;
    }

    // Apply position
    if (nx !== posRef.current.x || nz !== posRef.current.z) {
      posRef.current = { x: nx, z: nz };
      groupRef.current.position.set(nx, 0, nz);
      onMove?.({ x: nx, z: nz });
    }
  });

  return (
    <group ref={groupRef as any}>
      {children ?? (
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 0.9, 12]} />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
      )}
    </group>
  );
}

/* Collision helpers */
function intersects(p: { x: number; z: number }, r: number, cs: Collider[]) {
  for (const c of cs) {
    if (c.kind === "circle") {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (dx * dx + dz * dz < (r + c.r) * (r + c.r)) return true;
    } else {
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
