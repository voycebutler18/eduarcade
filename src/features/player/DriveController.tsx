import React, { useEffect, useRef } from "react";
import { Group, Object3D } from "three";
import { useFrame } from "@react-three/fiber";

type Vec2 = { x: number; z: number };

export default function DriveController({
  start = { x: 0, z: 6 },
  accel = 24,
  maxSpeed = 9,
  damping = 3.5,
  nodeRef,
  inputDirRef,           // optional {x,z} from your Thumbstick
  manualYawRef,          // optional freeze-facing ref
  autoDemo = false,      // set true to make it move in a circle so you can SEE motion even with no input
  children,
}: {
  start?: Vec2;
  accel?: number;
  maxSpeed?: number;
  damping?: number;
  nodeRef?: React.MutableRefObject<Object3D | null>;
  inputDirRef?: React.MutableRefObject<{ x: number; z: number } | null>;
  manualYawRef?: React.MutableRefObject<number | null>;
  autoDemo?: boolean;
  children?: React.ReactNode;
}) {
  const localRef = useRef<Group>(null);
  const ref = nodeRef ?? localRef;

  const pos = useRef<Vec2>({ ...start });
  const vel = useRef<Vec2>({ x: 0, z: 0 });
  const yaw = useRef(0);
  const targetYaw = useRef<number | null>(null);
  const keys = useRef<Record<string, boolean>>({});

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const len = (v: Vec2) => Math.hypot(v.x, v.z);
  const shortestAngle = (a: number, b: number) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  useEffect(() => {
    if (ref.current) ref.current.position.set(start.x, 0, start.z);
    const wanted = new Set(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"]);
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable)) return;
      if (wanted.has(e.code)) { e.preventDefault(); keys.current[e.code] = true; }
    };
    const up = (e: KeyboardEvent) => { if (wanted.has(e.code)) { e.preventDefault(); keys.current[e.code] = false; } };
    const clear = () => { for (const k of wanted) keys.current[k] = false; };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up, { passive: false });
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down as any);
      window.removeEventListener("keyup", up as any);
      window.removeEventListener("blur", clear as any);
    };
  }, [start.x, start.z]);

  function getInputDir(): Vec2 {
    // 1) thumbstick first
    const s = inputDirRef?.current;
    if (s) {
      const m = Math.hypot(s.x, s.z);
      if (m > 0.12) return { x: s.x / m, z: s.z / m };
    }
    // 2) keyboard fallback
    let x = 0, z = 0;
    const k = keys.current;
    if (k["KeyW"] || k["ArrowUp"])    z -= 1;
    if (k["KeyS"] || k["ArrowDown"])  z += 1;
    if (k["KeyA"] || k["ArrowLeft"])  x -= 1;
    if (k["KeyD"] || k["ArrowRight"]) x += 1;
    const m = Math.hypot(x, z);
    if (m > 0) return { x: x / m, z: z / m };

    // 3) auto-demo (forces visible movement)
    if (autoDemo) {
      // slow circular motion
      const t = performance.now() * 0.001;
      return { x: Math.sin(t), z: Math.cos(t) };
    }
    return { x: 0, z: 0 };
  }

  useFrame((_s, rawDt) => {
    const dt = clamp(rawDt, 0, 0.05);

    // direction
    const dir = getInputDir();

    // accelerate toward input
    if (dir.x !== 0 || dir.z !== 0) {
      vel.current.x += dir.x * accel * dt;
      vel.current.z += dir.z * accel * dt;

      // cap speed
      const vmag = len(vel.current);
      if (vmag > maxSpeed) {
        vel.current.x = (vel.current.x / vmag) * maxSpeed;
        vel.current.z = (vel.current.z / vmag) * maxSpeed;
      }

      // face travel unless locked
      if (!(manualYawRef && manualYawRef.current != null)) {
        const aim = Math.atan2(vel.current.x, vel.current.z);
        targetYaw.current = aim;
      }
    } else {
      // damping (coast)
      const k = Math.exp(-damping * dt);
      vel.current.x *= k;
      vel.current.z *= k;
    }

    // rotate smoothly
    const ROT_DAMP = 16;
    if (manualYawRef && manualYawRef.current != null) {
      yaw.current = manualYawRef.current;
    } else if (targetYaw.current != null) {
      const step = 1 - Math.exp(-ROT_DAMP * dt);
      yaw.current += shortestAngle(yaw.current, targetYaw.current) * step;
    }

    // integrate
    pos.current.x += vel.current.x * dt;
    pos.current.z += vel.current.z * dt;

    // apply
    if (ref.current) {
      ref.current.position.set(pos.current.x, 0, pos.current.z);
      ref.current.rotation.y = yaw.current;
    }
  });

  return (
    <group ref={ref as React.MutableRefObject<Group | null>}>
      {children ?? (
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.45, 0.45, 0.9, 12]} />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
      )}
    </group>
  );
}
