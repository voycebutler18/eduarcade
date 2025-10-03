import React, { useRef, useState, useEffect } from "react";

type Vec2 = { x: number; z: number };

export default function Thumbstick({
  onChange,
  size = 120,
  deadzone = 0.08,
  className = "",
}: {
  onChange: (dir: Vec2) => void;     // normalized -1..1
  size?: number;
  deadzone?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 }); // px offset

  // helper: set direction from a pointer event
  function updateFromEvent(e: PointerEvent | React.PointerEvent) {
    const el = wrapRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = (("clientX" in e ? e.clientX : 0) - cx) / (rect.width / 2);
    const dy = (("clientY" in e ? e.clientY : 0) - cy) / (rect.height / 2);

    // clamp circle radius 1
    const mag = Math.hypot(dx, dy) || 1;
    const nx = Math.max(-1, Math.min(1, dx / Math.max(1, mag)));
    const ny = Math.max(-1, Math.min(1, dy / Math.max(1, mag)));

    // apply deadzone
    const dm = Math.hypot(nx, ny);
    const gx = dm < deadzone ? 0 : nx;
    const gy = dm < deadzone ? 0 : ny;

    // move knob (visual)
    const r = (rect.width / 2) * 0.45;
    setKnob({ x: gx * r, y: gy * r });

    // convert screen Y (down positive) to world Z (forward negative)
    onChange({ x: gx, z: -gy });
  }

  function endStick() {
    setActive(false);
    setKnob({ x: 0, y: 0 });
    onChange({ x: 0, z: 0 });
  }

  useEffect(() => {
    const move = (ev: PointerEvent) => active && updateFromEvent(ev);
    const up = () => active && endStick();
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up, { passive: false });
    window.addEventListener("pointercancel", up, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [active]);

  return (
    <div
      ref={wrapRef}
      className={`thumbstick ${className}`}
      style={{
        position: "absolute",
        left: 16,
        bottom: 16,
        width: size,
        height: size,
        borderRadius: size,
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.12)",
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        setActive(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        updateFromEvent(e);
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size * 0.42,
          height: size * 0.42,
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          borderRadius: 999,
          background: "rgba(96,165,250,.9)",
          boxShadow: "0 6px 16px rgba(96,165,250,.35)",
        }}
      />
    </div>
  );
}
