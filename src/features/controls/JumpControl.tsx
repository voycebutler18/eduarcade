// src/features/controls/JumpControl.tsx
import { useEffect, useRef } from "react";

/**
 * JumpControl
 * - Handles pressing Space (or another key) to make the player jump.
 * - Works with PlayerController if you add Y position handling.
 * - Updates jump state in a shared ref (so the controller can apply vertical velocity).
 *
 * Usage:
 * const jumpRef = useRef(false);
 * <JumpControl jumpRef={jumpRef} />
 */
export default function JumpControl({
  jumpRef,
  key = "Space",
}: {
  jumpRef: React.MutableRefObject<boolean>;
  key?: string;
}) {
  const pressed = useRef(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === key && !pressed.current) {
        pressed.current = true;
        jumpRef.current = true; // trigger jump
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === key) {
        pressed.current = false;
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [key, jumpRef]);

  return null;
}
