// src/features/player/PlayerController.tsx
import { useEffect, useRef } from "react";
import { Group, Object3D } from "three";
import { useFrame } from "@react-three/fiber";
import type { Collider } from "../campus/OutdoorWorld3D";

/**
 * PlayerController (thumbstick-first)
 * - Thumbstick (inputDirRef {x,z}) takes priority; keyboard is fallback.
 * - Smooth facing while moving; facing stays when stick releases (manualYawRef from App).
 * - Collision with overlap escape so you don't get stuck.
 * - Jump/sprint hooks preserved (safe to ignore if unused).
 */

type Vec2 = { x: number; z: number };
type DirRef = React.MutableRefObject<{ x: number; z: number } | null>;

export default function PlayerController({
  start = { x: 0, z: 6 },
  speed = 6,
  speedRef,
  radius = 0.45,
  colliders = [],
  nodeRef,
  inputDirRef,                 // << thumbstick vector (preferred)
  onMove,
  // Facing control
  ignoreInputYaw = false,
  manualYawRef,                // << App freezes yaw with this on stick release
  // Jump/Gravity (optional)
  groundY = 0,
  gravity = 30,
  jumpSpeed = 8,
  airControl = 0.65,
  coyoteMs = 120,
  jumpBufferMs = 120,
  maxAirJumps = 1,
  jumpCutMultiplier = 0.45,
  fallGravityMultiplier = 1.4,
  jumpRef,
  jumpHeldRef,
  children,
}: {
  start?: Vec2;
  speed?: number;
  speedRef?: React.MutableRefObject<number | undefined>;
  radius?: number;
  colliders?: Collider[];
  nodeRef?: React.MutableRefObject<Object3D | null>;
  inputDirRef?: DirRef;
  onMove?: (pos: Vec2) => void;
  ignoreInputYaw?: boolean;
  manualYawRef?: React.MutableRefObject<number | null>;
  groundY?: number;
  gravity?: number;
  jumpSpeed?: number;
  airControl?: number;
  coyoteMs?: number;
  jumpBufferMs?: number;
  maxAirJumps?: number;
  jumpCutMultiplier?: number;
  fallGravityMultiplier?: number;
  jumpRef?: React.MutableRefObject<boolean | undefined>;
  jumpHeldRef?: React.MutableRefObject<boolean | undefined>;
  children?: React.ReactNode;
}) {
  const localRef = useRef<Group>(null);
  const ref = nodeRef ?? localRef;

  // horizontal pos
  const pos = useRef<Vec2>({ ...start });
  const placedOnce = useRef(false);

  // vertical physics
  const y = useRef<number>(groundY);
  const vy = useRef<number>(0);
  const grounded = useRef<boolean>(true);
  const airJumpsUsed = useRef<number>(0);

  // keyboard state
  const keys = useRef<Record<string, boolean>>({});
  const prevSpace = useRef(false);

  // integrator
  const STEP = 1 / 120;
  const EPS = 1e-5;
  const acc = useRef(0);

  // facing
  const yaw = useRef(0);
  const targetYaw = useRef<number | null>(null);

  // jump timing
  const lastGroundedMs = useRef<number>(performance.now());
  const jumpBufferUntilMs = useRef<number>(0);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const wanted = new Set([
      "KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"
    ]);
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

  /* ---------- input (thumbstick FIRST, then keyboard) ---------- */
  function readInput(): Vec2 {
    // 1) thumbstick has priority
    const s = inputDirRef?.current;
    if (s) {
      const mag = Math.hypot(s.x, s.z);
      const DEAD = 0.12; // forgiving dead-zone
      if (mag > DEAD) {
        return { x: s.x / mag, z: s.z / mag };
      }
    }
    // 2) else keyboard
    let x = 0, z = 0;
    const k = keys.current;
    if (k["KeyW"] || k["ArrowUp"])    z -= 1;
    if (k["KeyS"] || k["ArrowDown"])  z += 1;
    if (k["KeyA"] || k["ArrowLeft"])  x -= 1;
    if (k["KeyD"] || k["ArrowRight"]) x += 1;
    const m = Math.hypot(x, z);
    return m > 0 ? { x: x / m, z: z / m } : { x: 0, z: 0 };
  }

  /* ---------- collision helpers with overlap escape ---------- */
  function penetration(x: number, z: number, r: number, cs: Collider[]): number {
    let worst = -Infinity; let any = false;
    for (const c of cs) {
      if (c.kind === "circle") {
        const dx = x - c.x, dz = z - c.z;
        const dist = Math.hypot(dx, dz);
        worst = Math.max(worst, (r + c.r) - dist);
        any = true;
      } else {
        const hw = c.w / 2, hd = c.d / 2;
        const cx = clamp(x, c.x - hw, c.x + hw);
        const cz = clamp(z, c.z - hd, c.z + hd);
        const dist = Math.hypot(x - cx, z - cz);
        worst = Math.max(worst, r - dist);
        any = true;
      }
    }
    return any ? Math.max(worst, 0) : 0; // 0 = clear, >0 = inside
  }
  function tryMove(cur: Vec2, dx: number, dz: number): Vec2 {
    const nextX = { x: cur.x + dx, z: cur.z };
    const nextZ = { x: cur.x,     z: cur.z + dz };

    const curPen = penetration(cur.x, cur.z, radius, colliders);
    const penX   = penetration(nextX.x, nextX.z, radius, colliders);
    const penZ   = penetration(nextZ.x, nextZ.z, radius, colliders);

    if (curPen === 0) {
      const nx = penX === 0 ? nextX.x : cur.x;
      const nz = penZ === 0 ? nextZ.z : cur.z;
      return { x: nx, z: nz };
    }
    // if currently intersecting, accept any move that reduces penetration
    let best: Vec2 = cur; let bestPen = curPen;
    if (penX < bestPen) { best = nextX; bestPen = penX; }
    if (penZ < bestPen) { best = nextZ; bestPen = penZ; }
    return best;
  }
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const shortestAngle = (a: number, b: number) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  /* ---------- mount ---------- */
  useEffect(() => {
    pos.current = { ...start };
    y.current = groundY;
    vy.current = 0;
    grounded.current = true;
    airJumpsUsed.current = 0;
    if (ref.current) ref.current.position.set(start.x, y.current, start.z);
    placedOnce.current = true;
    yaw.current = 0;
    targetYaw.current = null;
    lastGroundedMs.current = performance.now();
    jumpBufferUntilMs.current = 0;
    prevSpace.current = false;
    onMove?.({ ...start });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- main loop ---------- */
  useFrame((_state, dt) => {
    if (!placedOnce.current && ref.current) {
      ref.current.position.set(pos.current.x, y.current, pos.current.z);
      placedOnce.current = true;
    }

    const clamped = Math.min(0.05, Math.max(0, dt));
    acc.current += clamped;

    let moved = false;
    const baseSpeed = speedRef?.current ?? speed;
    const currentSpeed = grounded.current ? baseSpeed : baseSpeed * airControl;

    while (acc.current >= STEP) {
      acc.current -= STEP;

      // jump input (optional)
      const spaceHeld = jumpHeldRef?.current ?? !!keys.current["Space"];
      const spaceDownEdge =
        jumpRef?.current === true || (!!keys.current["Space"] && !prevSpace.current);
      if (jumpRef && jumpRef.current) jumpRef.current = false;
      if (spaceDownEdge) jumpBufferUntilMs.current = performance.now() + jumpBufferMs;
      prevSpace.current = !!keys.current["Space"];

      // movement
      const dir = readInput();
      if (dir.x !== 0 || dir.z !== 0) {
        if (!ignoreInputYaw && !(manualYawRef && manualYawRef.current != null)) {
          targetYaw.current = Math.atan2(dir.x, dir.z); // face stick/keys while moving
        }
        const dx = dir.x * currentSpeed * STEP;
        const dz = dir.z * currentSpeed * STEP;
        const next = tryMove(pos.current, dx, dz);
        if (Math.abs(next.x - pos.current.x) > EPS || Math.abs(next.z - pos.current.z) > EPS) {
          pos.current = next;
          moved = true;
        }
      }

      // gravity
      const g = vy.current > 0 ? gravity : gravity * fallGravityMultiplier;
      vy.current -= g * STEP;
      y.current += vy.current * STEP;

      // ground resolve
      const wasGrounded = grounded.current;
      if (y.current <= groundY) {
        y.current = groundY;
        if (vy.current < 0) vy.current = 0;
        grounded.current = true;
      } else {
        grounded.current = false;
      }
      if (grounded.current) {
        lastGroundedMs.current = performance.now();
        if (!wasGrounded) airJumpsUsed.current = 0;
      }

      // buffered/coyote/air jump
      const now = performance.now();
      const withinBuffer = now <= jumpBufferUntilMs.current;
      const withinCoyote = (now - lastGroundedMs.current) <= coyoteMs;
      const canGroundJump = grounded.current && withinBuffer;
      const canCoyoteJump = !grounded.current && withinCoyote && withinBuffer;
      const canAirJump = !grounded.current && !withinCoyote && withinBuffer && (airJumpsUsed.current < maxAirJumps);

      if (canGroundJump || canCoyoteJump || canAirJump) {
        vy.current = jumpSpeed;
        y.current += vy.current * STEP * 0.5;
        grounded.current = false;
        jumpBufferUntilMs.current = 0;
        if (canAirJump && !canGroundJump && !canCoyoteJump) airJumpsUsed.current += 1;
      }

      // short hop
      if (!spaceHeld && vy.current > 0) vy.current *= jumpCutMultiplier;
    }

    // yaw update (manual freeze wins; else turn toward movement)
    const DAMP = 16;
    if (manualYawRef && manualYawRef.current != null) {
      yaw.current = manualYawRef.current;
    } else if (targetYaw.current !== null) {
      const d = shortestAngle(yaw.current, targetYaw.current);
      const t = 1 - Math.exp(-DAMP * clamped);
      yaw.current = yaw.current + d * t;
    }

    // apply transforms
    if (ref.current) {
      if (moved || !grounded.current) {
        ref.current.position.set(pos.current.x, y.current, pos.current.z);
        onMove?.({ ...pos.current });
      } else {
        ref.current.position.y = y.current;
      }
      ref.current.rotation.y = yaw.current;
    }
  });

  /* ---------- render ---------- */
  return (
    <group ref={ref as React.MutableRefObject<Group | null>}>
      {children ?? (
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 0.9, 12]} />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
      )}
    </group>
  );
}
