// src/features/player/WalkAnywhere.tsx
import { useEffect, useState } from "react";
import PlayerController from "./PlayerController";
import type { Collider } from "../campus/OutdoorWorld3D";
import type { Object3D } from "three";

type Vec2 = { x: number; z: number };
type DirRef = React.MutableRefObject<{ x: number; z: number } | null>;

export default function WalkAnywhere({
  enabled: enabledProp,
  onToggle,
  // pass-through PlayerController props:
  start = { x: 0, z: 6 },
  speed = 6,
  speedRef,
  radius = 0.45,
  colliders = [],
  nodeRef,
  inputDirRef,
  onMove,
  ignoreInputYaw,
  manualYawRef,
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
  enabled?: boolean;                        // start in walk-anywhere mode
  onToggle?: (v: boolean) => void;          // notify parent when toggled (via G)
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
  const [enabled, setEnabled] = useState<boolean>(!!enabledProp);

  // keep in sync if parent changes prop
  useEffect(() => {
    if (enabledProp !== undefined) setEnabled(!!enabledProp);
  }, [enabledProp]);

  // Hotkey: press G to toggle free-roam
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyG") {
        setEnabled((v) => {
          const nv = !v;
          onToggle?.(nv);
          return nv;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle]);

  return (
    <PlayerController
      start={start}
      speed={speed}
      speedRef={speedRef}
      radius={radius}
      // MAIN TRICK: when enabled, zero colliders so nothing blocks you
      colliders={enabled ? [] : colliders}
      nodeRef={nodeRef}
      inputDirRef={inputDirRef}
      onMove={onMove}
      ignoreInputYaw={ignoreInputYaw}
      manualYawRef={manualYawRef}
      groundY={groundY}
      gravity={gravity}
      jumpSpeed={jumpSpeed}
      airControl={airControl}
      coyoteMs={coyoteMs}
      jumpBufferMs={jumpBufferMs}
      maxAirJumps={maxAirJumps}
      jumpCutMultiplier={jumpCutMultiplier}
      fallGravityMultiplier={fallGravityMultiplier}
      jumpRef={jumpRef}
      jumpHeldRef={jumpHeldRef}
    >
      {children}
    </PlayerController>
  );
}
