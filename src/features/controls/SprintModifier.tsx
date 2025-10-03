// src/features/controls/SprintModifier.tsx
import { useEffect } from "react";

/**
 * SprintModifier
 * - Allows the player to hold Shift (or a custom key) to sprint.
 * - Temporarily boosts the player's speed multiplier in PlayerController.
 * - Resets when the key is released.
 *
 * Usage:
 * <SprintModifier inputDirRef={inputDirRef} speedRef={speedRef} />
 *
 * Assumes PlayerController reads `speedRef.current` each frame.
 */
export default function SprintModifier({
  speedRef,
  baseSpeed = 6,
  sprintSpeed = 10,
  key = "ShiftLeft",
}: {
  speedRef: React.MutableRefObject<number>;
  baseSpeed?: number;
  sprintSpeed?: number;
  key?: string;
}) {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === key) {
        speedRef.current = sprintSpeed;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === key) {
        speedRef.current = baseSpeed;
      }
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [baseSpeed, sprintSpeed, key]);

  return null;
}
