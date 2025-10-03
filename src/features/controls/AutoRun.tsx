// src/features/controls/AutoRun.tsx
import { useEffect, useRef } from "react";

/**
 * AutoRun
 * - Double-tap any movement key to toggle auto-run.
 * - Keeps moving forward (z:-1) until cancelled.
 * - Cancels when user presses a manual movement key again.
 */
export default function AutoRun({
  inputDirRef,
  forward = { x: 0, z: -1 },
  resetOnUserInput = true,
  doubleTapMs = 300,
}: {
  inputDirRef: React.MutableRefObject<{ x: number; z: number }>;
  forward?: { x: number; z: number };
  resetOnUserInput?: boolean;
  doubleTapMs?: number;
}) {
  const lastTap = useRef(0);
  const running = useRef(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const codes = ["KeyW", "ArrowUp", "KeyA", "ArrowLeft", "KeyS", "ArrowDown", "KeyD", "ArrowRight"];
      if (!codes.includes(e.code)) return;

      // If autorun is active, cancel on manual input
      if (resetOnUserInput && running.current) {
        running.current = false;
        inputDirRef.current = { x: 0, z: 0 };
        return;
      }

      // Double-tap detection
      const now = performance.now();
      if (now - lastTap.current < doubleTapMs) {
        running.current = !running.current;
        inputDirRef.current = running.current ? forward : { x: 0, z: 0 };
      }
      lastTap.current = now;
    };

    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [inputDirRef, forward, resetOnUserInput, doubleTapMs]);

  useEffect(() => {
    const id = setInterval(() => {
      if (running.current) {
        inputDirRef.current = forward;
      }
    }, 50);
    return () => clearInterval(id);
  }, [forward, inputDirRef]);

  return null;
}
