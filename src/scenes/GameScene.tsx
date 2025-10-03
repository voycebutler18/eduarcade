// src/scenes/GameScene.tsx
import { useRef, useState } from "react";
import PlayerController from "../features/player/PlayerController";
import HeroRig3D from "../features/avatar/HeroRig3D";
import Thumbstick from "../features/controls/Thumbstick";
import FollowCam from "../features/player/FollowCam";
import ClickToMove from "../features/controls/ClickToMove";
import AutoRun from "../features/controls/AutoRun";
import EnsureCanvasFocus from "../features/controls/EnsureCanvasFocus";
import DPad from "../features/controls/DPad";
import { AvatarPreset } from "../state/avatar";

export default function GameScene({ preset }: { preset: AvatarPreset | null }) {
  const inputDirRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const playerRef = useRef<THREE.Object3D | null>(null);
  const [moving, setMoving] = useState(false);

  // track player position for click-to-move
  let lastPos = { x: 0, z: 0 };

  return (
    <>
      {/* Player */}
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

      {/* Camera follows player */}
      <FollowCam targetRef={playerRef} offset={[0, 3.5, 6]} lookAtOffset={[0, 1.1, 0]} lerp={0.15} />

      {/* Controls */}
      <ClickToMove inputDirRef={inputDirRef} getPlayerPos={() => lastPos} />
      <AutoRun inputDirRef={inputDirRef} />
      <EnsureCanvasFocus />

      {/* UI overlay — either Thumbstick OR DPad */}
      <div style={{ position: "absolute", bottom: 40, left: 40 }}>
        <Thumbstick
          onChange={(dir) => {
            if (dir) inputDirRef.current = dir;
            else inputDirRef.current = { x: 0, z: 0 };
          }}
        />
        {/* Or use this instead of Thumbstick: */}
        {/* <DPad inputDirRef={inputDirRef} /> */}
      </div>
    </>
  );
}
