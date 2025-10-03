// src/features/controls/EnsureCanvasFocus.tsx
import { useEffect } from "react";

/**
 * EnsureCanvasFocus
 * - Makes sure keyboard input goes to the canvas.
 * - When user clicks/taps anywhere on the renderer, it grabs focus.
 * - Prevents arrow keys from being ignored by the browser.
 */
export default function EnsureCanvasFocus() {
  useEffect(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;

    const makeFocusable = () => {
      // allow canvas to take tab focus
      canvas.setAttribute("tabindex", "0");
    };

    const focusOnClick = () => {
      canvas.focus();
    };

    makeFocusable();
    canvas.addEventListener("mousedown", focusOnClick);
    canvas.addEventListener("touchstart", focusOnClick);

    return () => {
      canvas.removeEventListener("mousedown", focusOnClick);
      canvas.removeEventListener("touchstart", focusOnClick);
    };
  }, []);

  return null;
}
