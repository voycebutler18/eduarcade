// src/features/player/GlideController.tsx
import { useEffect, useRef } from "react";
import { Group, Object3D } from "three";
import { useFrame } from "@react-three/fiber";

type Vec2 = { x: number; z: number };
type DirRef = React.MutableRefObject<{ x: number; z: number } | null>;

export default function GlideController({
  // start position + motion tuning
  start = { x: 0, z: 6 },
  accel = 18,            // how fast it speeds up toward input (units/s^2)
  damping = 2.2,         // how quickly it slows when no input (1/s) – higher = stops sooner
  maxSpeed = 8,          // top speed (units/s)
  // facing control
  manualYawRef,          // optional: freeze facing (use your App's thumbstick release logic)
  ignoreInputYaw = false,
  // input + node
  inputDirRef,           // thumbstick direction {x,z}, prioritized; null on release
  nodeRef,               // external ref to the object to move (optional)
  onMove,
  children,
}: {
  start?: Vec2;
  accel?: number;
  damping?: number;
  maxSpeed?: number;
  manualYawRef?: React.MutableRefObject<number | null>;
  ignoreInputYaw?: boolean;
  inputDirRef?: DirRef;
  nodeRef?: React.MutableRefObject<Object3D | null>;
  onMove?: (pos: Vec2) => void;
  children?: React.ReactNode;
}) {
  const localRef = useRef<Group>(null);
  const ref = nodeRef ?? localRef;

  // state
  const pos = useRef<Vec2>({ ...start });
  const vel = useRef<Vec2>({ x: 0, z: 0 });
  const yaw = useRef<number>(0);
  const targetYaw = useRef<number | null>(null);

  // keyboard fallback
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const wanted = new Set(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"]);
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable)) return;
      if (wanted.has(e.code)) { e.preventDefault(); keys.current[e.code] = true; }
    };
    const up = (e: KeyboardEvent) => { if (wanted.has(e.code)) { e.preventDefault(); keys.current[e.code] = false; } };
    const clear = () => { for (const k of wanted) keys.current[k] = false; };
    window.addEventListener("keydown", down, { passive:false });
    window.addEventListener("keyup", up, { passive:false });
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down as any);
      window.removeEventListener("keyup", up as any);
      window.removeEventListener("blur", clear as any);
    };
  }, []);

  function readInput(): Vec2 {
    // 1) thumbstick has priority
    const s = inputDirRef?.current;
    if (s) {
      const m = Math.hypot(s.x, s.z);
      if (m > 0.12) return { x: s.x / m, z: s.z / m };
    }
    // 2) keyboard
    let x = 0, z = 0;
    const k = keys.current;
    if (k["KeyW"] || k["ArrowUp"])    z -= 1;
    if (k["KeyS"] || k["ArrowDown"])  z += 1;
    if (k["KeyA"] || k["ArrowLeft"])  x -= 1;
    if (k["KeyD"] || k["ArrowRight"]) x += 1;
    const m = Math.hypot(x, z);
    return m > 0 ? { x: x / m, z: z / m } : { x: 0, z: 0 };
  }

  // helpers
  const shortestAngle = (a: number, b: number) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  useEffect(() => {
    if (ref.current) ref.current.position.set(start.x, 0, start.z);
    pos.current = { ...start };
    vel.current = { x: 0, z: 0 };
    yaw.current = 0;
    targetYaw.current = null;
    onMove?.({ ...start });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_state, dt) => {
    const dir = readInput();

    // acceleration toward input
    if (dir.x !== 0 || dir.z !== 0) {
      // accelerate
      vel.current.x += dir.x * accel * dt;
      vel.current.z += dir.z * accel * dt;

      // face input unless manual override
      if (!ignoreInputYaw && !(manualYawRef && manualYawRef.current != null)) {
        targetYaw.current = Math.atan2(dir.x, dir.z);
      }
    } else {
      // no input: apply damping (exponential decay for smooth glide)
      const f = Math.max(0, 1 - damping * dt);
      vel.current.x *= f;
      vel.current.z *= f;
    }

    // clamp top speed
    const spd = Math.hypot(vel.current.x, vel.current.z);
    if (spd > maxSpeed) {
      const s = maxSpeed / spd;
      vel.current.x *= s;
      vel.current.z *= s;
    }

    // integrate position (no collisions, no gravity)
    pos.current.x += vel.current.x * dt;
    pos.current.z += vel.current.z * dt;

    // facing
    const t = Math.min(1, dt * 16); // smoothing
    if (manualYawRef && manualYawRef.current != null) {
      yaw.current = manualYawRef.current;
    } else if (targetYaw.current !== null) {
      yaw.current = yaw.current + shortestAngle(yaw.current, targetYaw.current) * t;
    } else if (spd > 0.01) {
      // face velocity if we were already moving (nice when manualYawRef isn't used)
      const vAng = Math.atan2(vel.current.x, vel.current.z);
      yaw.current = yaw.current + shortestAngle(yaw.current, vAng) * t;
    }

    // apply
    if (ref.current) {
      ref.current.position.set(pos.current.x, 0, pos.current.z);
      ref.current.rotation.y = yaw.current;
      onMove?.({ ...pos.current });
    }
  });

  return (
    <group ref={ref as React.MutableRefObject<Group | null>}>
      {children}
    </group>
  );
}
