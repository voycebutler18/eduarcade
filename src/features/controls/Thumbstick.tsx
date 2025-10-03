// src/features/controls/Thumbstick.tsx
import React, { useEffect, useRef, useState } from "react";

type Vec2 = { x: number; y: number };
type Dir = { x: number; z: number };

export default function Thumbstick({
  radius = 64,             // visual radius (px) of base ring
  handleRadius = 26,       // knob radius (px)
  deadZone = 0.18,         // ignore tiny motions
  onChange,
  label = "Move",
}: {
  radius?: number;
  handleRadius?: number;
  deadZone?: number;
  onChange: (dir: Dir | null) => void; // null = released
  label?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const handlePos = useRef<Vec2>({ x: 0, y: 0 }); // knob local coords in px (centered)
  const [, setTick] = useState(0); // force re-render for knob

  // normalize knob position -> [-1,1] and emit (x,z) where up = z:-1, right = x:+1
  const emit = (px: number, py: number) => {
    const r = radius - handleRadius;         // travel radius for the knob
    const nx = clamp(px / r, -1, 1);         // [-1,1]
    const ny = clamp(py / r, -1, 1);         // [-1,1] where down is +1 visually
    const mag = Math.hypot(nx, ny);
    if (mag < deadZone) {
      onChange(null);
      return;
    }
    // map screen (x, y) to world (x, z). Up on screen (ny < 0) -> forward (z = -1).
    const x = nx / mag;
    const z = -ny / mag;
    onChange({ x, z });
  };

  const onPointerDown: React.PointerEventHandler = (e) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromEvent(e);
  };

  const onPointerMove: React.PointerEventHandler = (e) => {
    if (!dragging) return;
    updateFromEvent(e);
  };

  const onPointerUp: React.PointerEventHandler = (e) => {
    if (!dragging) return;
    setDragging(false);
    // reset knob to center and emit a single null to freeze facing (manualYaw will take over)
    handlePos.current = { x: 0, y: 0 };
    setTick((t) => t + 1);
    onChange(null);
  };

  function updateFromEvent(e: React.PointerEvent) {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const rect = wrap.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // local delta from center (px)
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;

    // constrain knob within travel radius (base radius - handle radius)
    const maxR = Math.max(8, radius - handleRadius);
    const len = Math.hypot(dx, dy);
    if (len > maxR) {
      const s = maxR / len;
      dx *= s;
      dy *= s;
    }

    handlePos.current = { x: dx, y: dy };
    setTick((t) => t + 1);
    emit(dx, dy);
  }

  // prevent passive scrolling on touch
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchmove", prevent, { passive: false });
    return () => el.removeEventListener("touchmove", prevent);
  }, []);

  // styles
  const size = radius * 2;
  const wrapStyle: React.CSSProperties = {
    width: size,
    height: size,
    position: "relative",
    touchAction: "none",
    userSelect: "none",
  };
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: size,
    height: size,
    borderRadius: size,
    background:
      "radial-gradient(closest-side, rgba(255,255,255,0.22), rgba(255,255,255,0.08))",
    boxShadow: "inset 0 8px 18px rgba(0,0,0,0.35), 0 2px 10px rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.35)",
  };
  const knobStyle: React.CSSProperties = {
    position: "absolute",
    left: radius - handleRadius + handlePos.current.x,
    top: radius - handleRadius + handlePos.current.y,
    width: handleRadius * 2,
    height: handleRadius * 2,
    borderRadius: handleRadius * 2,
    background:
      "radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,255,255,0.7))",
    boxShadow:
      "0 12px 22px rgba(0,0,0,0.35), inset 0 2px 4px rgba(255,255,255,0.7)",
    border: "1px solid rgba(255,255,255,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    fontWeight: 700,
    color: "#0b1222",
    letterSpacing: 0.6,
  };

  return (
    <div
      ref={wrapRef}
      style={wrapStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div style={baseStyle} />
      <div style={knobStyle}>{label}</div>
    </div>
  );
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
