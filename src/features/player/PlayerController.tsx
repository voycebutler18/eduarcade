import { useEffect, useRef, useState } from "react";
import { Collider } from "../campus/OutdoorWorld3D";

type Vec2 = { x: number; z: number };

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  radius = 0.45,
  colliders = [],
  onMove,
  nodeRef,                 // NEW: group ref so a camera can follow
  inputDirRef,             // NEW: external thumbstick direction (-1..1)
  children,                // NEW: your avatar model
}: {
  start?: Vec2;
  speed?: number;
  radius?: number;
  colliders?: Collider[];
  onMove?: (pos: Vec2) => void;
  nodeRef?: React.MutableRefObject<THREE.Object3D | null>;
  inputDirRef?: React.MutableRefObject<Vec2 | null>;
  children?: React.ReactNode;
}) {
  const [pos, setPos] = useState<Vec2>(start);
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const down = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = true);
    const up   = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = false);
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

      // --- gather input ---
      let ix = 0, iz = 0;

      // thumbstick (if present) has priority when non-zero
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

      if (ix || iz) {
        const mag = Math.hypot(ix, iz) || 1;
        let vx = (ix / mag) * speed * dt;
        let vz = (iz / mag) * speed * dt;

        // move X then Z with collision
        let nx = pos.x + vx;
        let nz = pos.z;

        if (intersects({ x: nx, z: nz }, radius, colliders)) nx = pos.x;

        nz = pos.z + vz;
        if (intersects({ x: nx, z: nz }, radius, colliders)) nz = pos.z;

        if (nx !== pos.x || nz !== pos.z) {
          const np = { x: nx, z: nz };
          setPos(np);
          onMove?.(np);
          if (nodeRef?.current) nodeRef.current.position.set(np.x, 0, np.z);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pos, speed, radius, colliders, onMove, inputDirRef, nodeRef]);

  return (
    <group
      ref={nodeRef as any}
      position={[pos.x, 0, pos.z]}
    >
      {/* Default fallback body if no children were passed */}
      {children ?? (
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
