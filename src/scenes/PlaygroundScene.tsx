// src/scenes/PlaygroundScene.tsx
import { useRef, useState } from "react";
import PlayerController from "../features/player/PlayerController";
import HeroRig3D from "../features/avatar/HeroRig3D";
import FollowCam from "../features/player/FollowCam";
import ClickToMove from "../features/controls/ClickToMove";
import AutoRun from "../features/controls/AutoRun";
import EnsureCanvasFocus from "../features/controls/EnsureCanvasFocus";
import ControlToggle from "../features/ui/ControlToggle";
import { AvatarPreset } from "../state/avatar";

/**
 * PlaygroundScene
 * - Bundles together all movement systems:
 *   * WASD / Arrows
 *   * Thumbstick or DPad (toggled)
 *   * Click-to-move
 *   * AutoRun toggle
 * - Smooth follow camera
 * - HeroRig3D walk/idle sway scaling
 * - Ensures canvas focus for keyboard input
 */
export default function PlaygroundScene({ preset }: { preset: AvatarPreset | null }) {
  const inputDirRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const playerRef = useRef<THREE.Object3D | null>(null);
  const [moving, setMoving] = useState(false);

  let lastPos = { x: 0, z: 0 };

  return (
    <>
      {/* Player + rig */}
      <PlayerController
        nodeRef={playerRef}
        inputDirRef={inputDirRef}
        onMove={(pos) => {
          lastPos = pos;
          const dir = inputDirRef.current;
          setMoving(Math.abs(dir.x) + Math.abs(dir.z) > 0.001);
        }}
      >
        <HeroRig3D preset={preset} moveAmount={moving ? 1 : 0.25} />
      </PlayerController>

      {/* Camera */}
      <FollowCam targetRef={playerRef} offset={[0, 3.5, 6]} lookAtOffset={[0, 1.1, 0]} lerp={0.15} />

      {/* Extra controls */}
      <ClickToMove inputDirRef={inputDirRef} getPlayerPos={() => lastPos} />
      <AutoRun inputDirRef={inputDirRef} />
      <EnsureCanvasFocus />

      {/* Switchable UI controls (Thumbstick <-> DPad) */}
      <ControlToggle inputDirRef={inputDirRef} />
    </>
  );
}
