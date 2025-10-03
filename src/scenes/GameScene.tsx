// src/scenes/GameScene.tsx
import { useRef } from "react";
import PlayerController from "@/features/player/PlayerController";
import HeroRig3D from "@/features/avatar/HeroRig3D";
import Thumbstick from "@/features/controls/Thumbstick";
import type { AvatarPreset } from "@/state/avatar";

export default function GameScene({ preset }: { preset: AvatarPreset | null }) {
  const inputDirRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });

  return (
    <>
      <PlayerController inputDirRef={inputDirRef}>
        <HeroRig3D preset={preset} />
      </PlayerController>

      {/* UI overlay */}
      <div style={{ position: "absolute", bottom: 40, left: 40 }}>
        <Thumbstick
          onChange={(dir) => {
            inputDirRef.current = dir ?? { x: 0, z: 0 };
          }}
        />
      </div>
    </>
  );
}
