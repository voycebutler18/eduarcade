// src/features/controls/EnsureCanvasFocus.tsx
import { useEffect } from "react";

/**
 * EnsureCanvasFocus
 * Makes sure the R3F canvas can receive keyboard events (WASD/Arrows).
 * - On first pointer/touch inside the canvas, we call focus() on it.
 * - Also sets tabIndex to 0 so the element is focusable.
 */
export default function EnsureCanvasFocus() {
  useEffect(() => {
    // find the nearest canvas element created by @react-three/fiber
    const canvases = document.getElementsByTagName("canvas");
    if (!canvases || canvases.length === 0) return;
    const canvas = canvases[0];

    // make it focusable
    (canvas as HTMLCanvasElement & { tabIndex?: number }).tabIndex = 0;

    const focusCanvas = () => {
      // avoid stealing focus from inputs
      const active = document.activeElement as HTMLElement | null;
      const isTyping =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          (active as any).isContentEditable);
      if (!isTyping) {
        canvas.focus();
      }
    };

    canvas.addEventListener("pointerdown", focusCanvas, { passive: true });
    canvas.addEventListener("touchstart", focusCanvas, { passive: true });

    // try to focus once on mount (desktop)
    focusCanvas();

    return () => {
      canvas.removeEventListener("pointerdown", focusCanvas as any);
      canvas.removeEventListener("touchstart", focusCanvas as any);
    };
  }, []);

  return null;
}
