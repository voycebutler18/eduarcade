// src/features/utils/ShowOnTouch.tsx
import React, { useEffect, useState } from "react";

/**
 * ShowOnTouch
 * - Renders children only when a touch-capable device is detected.
 * - Handy for showing Thumbstick/DPad on mobile but hiding on desktop.
 *
 * Usage:
 * <ShowOnTouch>
 *   <Thumbstick onChange={...} />
 * </ShowOnTouch>
 */
export default function ShowOnTouch({ children }: { children: React.ReactNode }) {
  const [isTouch, setIsTouch] = useState<boolean>(() => hasTouch());

  useEffect(() => {
    const onChange = () => setIsTouch(hasTouch());
    // Re-evaluate on resize/orientation change (covers many device toggles)
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);

    // Some browsers fire a 'touchstart' once on first interaction; use it to confirm
    const onFirstTouch = () => {
      setIsTouch(true);
      window.removeEventListener("touchstart", onFirstTouch);
    };
    window.addEventListener("touchstart", onFirstTouch, { passive: true });

    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      window.removeEventListener("touchstart", onFirstTouch);
    };
  }, []);

  if (!isTouch) return null;
  return <>{children}</>;
}

function hasTouch(): boolean {
  // Multiple strategies to detect touch support
  // 1) Navigator maxTouchPoints (most reliable modern)
  if (typeof navigator !== "undefined" && "maxTouchPoints" in navigator) {
    // @ts-ignore - older TS libs might not include maxTouchPoints
    if ((navigator as any).maxTouchPoints > 0) return true;
  }
  // 2) Pointer media query
  if (typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(pointer: coarse)");
    if (mq && mq.matches) return true;
  }
  // 3) Fallback to ontouchstart property
  if (typeof window !== "undefined" && "ontouchstart" in window) return true;

  return false;
}
