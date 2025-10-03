// src/features/player/PlayerController.tsx
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { Collider } from "../campus/OutdoorWorld3D";

/**
 * Render-light player controller for XZ plane:
 * - Keyboard (WASD/Arrows) + optional on-screen thumbstick via inputDirRef
 * - No per-frame React state updates (prevents jitter)
 * - Applies transforms directly to an Object3D (nodeRef) for smooth follow cam
 * - Axis-separated collision against Box/Circle colliders
 */

type Vec2 = { x: number; z: number };

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  radius = 0.45,
  colliders = [],
  nodeRef,
  inputDirRef,
  children,
}: {
  start?: Vec2;
  speed?: number;
  radius?: number;
  colliders?: Collider[];
  /** Group or Object3D that represents the player (used by FollowCam) */
  nodeRef: React.MutableRefObject<THREE.Object3D | null>;
  /** Optional: {x,z} direction vector from on-screen thumbstick in range [-1..1] */
  inputDirRef?: React.MutableRefObject<{ x: number; z: number } | null>;
  children?: React.ReactNode;
}) {
  // Internal position (no React state → no rerenders)
  const pos = useRef<Vec2>({ ...start });
  const running = useRef(true);
  const keys = useRef<Record<string, boolean>>({});
  const lastT = useRef<number>(performance.now());

  // Place the node at start on mount
  useLayoutEffect(() => {
    pos.current = { ...start };
    if (nodeRef?.current) {
      nodeRef.current.position.set(start.x, 0, start.z);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard handling (prevents page scroll on Arrow keys)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current[k] = true;
      if (
        k === "arrowup" ||
        k === "arrowdown" ||
        k === "arrowleft" ||
        k === "arrowright" ||
        k === " " // space
      ) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down as any);
      window.removeEventListener("keyup", up as any);
    };
  }, []);

  // RAF loop (no React state)
  useEffect(() => {
    running.current = true;
    let raf = 0;

    const tick = () => {
      if (!running.current) return;

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT.current) / 1000); // clamp big frame stalls
      lastT.current = now;

      // Direction from keyboard
      let dx = 0,
        dz = 0;
      const k = keys.current;
      if (k["w"] || k["arrowup"]) dz -= 1;
      if (k["s"] || k["arrowdown"]) dz += 1;
      if (k["a"] || k["arrowleft"]) dx -= 1;
      if (k["d"] || k["arrowright"]) dx += 1;

      // Mix in thumbstick (if present)
      if (inputDirRef?.current) {
        dx += inputDirRef.current.x;
        dz += inputDirRef.current.z;
      }

      // Normalize
      const mag = Math.hypot(dx, dz);
      if (mag > 0.0001) {
        dx /= mag;
        dz /= mag;

        const stepX = dx * speed * dt;
        const stepZ = dz * speed * dt;

        let nx = pos.current.x + stepX;
        let nz = pos.current.z;

        // collide X
        if (intersects(nx, nz, radius, colliders)) {
          nx = pos.current.x;
        }

        // then Z
        nz = pos.current.z + stepZ;
        if (intersects(nx, nz, radius, colliders)) {
          nz = pos.current.z;
        }

        // Apply
        if (nx !== pos.current.x || nz !== pos.current.z) {
          pos.current.x = nx;
          pos.current.z = nz;
          if (nodeRef?.current) {
            nodeRef.current.position.set(nx, 0, nz);
            // face movement direction (optional)
            if (mag > 0.2) {
              const yaw = Math.atan2(dx, dz); // XZ plane
              nodeRef.current.rotation.y = yaw;
            }
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      running.current = false;
      cancelAnimationFrame(raf);
    };
  }, [speed, radius, colliders, nodeRef, inputDirRef]);

  return (
    <group ref={nodeRef as any} position={[start.x, 0, start.z]}>
      {/* Your avatar (from parent) or fallback capsule */}
      {children ? (
        children
      ) : (
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 0.9, 12]} />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
      )}
    </group>
  );
}

/* -------- collision helpers -------- */

function intersects(px: number, pz: number, r: number, cs: Collider[]) {
  for (const c of cs) {
    if (c.kind === "circle") {
      const dx = px - c.x;
      const dz = pz - c.z;
      if (dx * dx + dz * dz < (r + c.r) * (r + c.r)) return true;
    } else {
      // AABB box
      const hw = c.w / 2;
      const hd = c.d / 2;
      const cx = clamp(px, c.x - hw, c.x + hw);
      const cz = clamp(pz, c.z - hd, c.z + hd);
      const dx = px - cx;
      const dz = pz - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
  }
  return false;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
