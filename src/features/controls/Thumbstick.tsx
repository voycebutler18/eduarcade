// src/features/controls/Thumbstick.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";

type Vec2 = { x: number; z: number } | null;

export default function Thumbstick({
  size = 120,        // base diameter
  knob = 46,         // knob diameter
  margin = 16,       // space from screen edges
  onChange,
}: {
  size?: number;
  knob?: number;
  margin?: number;
  onChange: (v: Vec2) => void;
}) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // pixel offset of knob from center
  const dragging = useRef(false);
  const center = useRef({ x: 0, y: 0 });
  const radius = size / 2;

  // Update center when layout changes
  const computeCenter = useCallback(() => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, []);

  // pointer helpers
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  const handleMoveFromClient = (cx: number, cy: number) => {
    // vector from center to pointer
    const dx = cx - center.current.x;
    const dy = cy - center.current.y;
    // limit to radius
    const len = Math.hypot(dx, dy);
    const k = len > radius ? radius / len : 1;
    const px = dx * k;
    const py = dy * k;
    setOffset({ x: px, y: py });

    // normalized vector in [-1, 1]
    const nx = (px / radius) || 0;
    const ny = (py / radius) || 0;
    // Map to game X/Z (up on screen should be negative Z)
    onChange({ x: nx, z: -ny });
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    handleMoveFromClient(e.clientX, e.clientY);
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setOffset({ x: 0, y: 0 });
    onChange({ x: 0, z: 0 }); // <- IMPORTANT: send zero, not null
  };

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    computeCenter();
    handleMoveFromClient(e.clientX, e.clientY);
  };

  useEffect(() => {
    // keep center accurate on resize/scroll
    const ro = new ResizeObserver(() => computeCenter());
    if (baseRef.current) ro.observe(baseRef.current);
    window.addEventListener("scroll", computeCenter, { passive: true });
    window.addEventListener("resize", computeCenter, { passive: true });

    // global listeners while dragging
    window.addEventListener("pointermove", handlePointerMove as any, { passive: false });
    window.addEventListener("pointerup", endDrag, { passive: true });
    window.addEventListener("pointercancel", endDrag, { passive: true });

    // first compute on mount
    computeCenter();
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", computeCenter);
      window.removeEventListener("resize", computeCenter);
      window.removeEventListener("pointermove", handlePointerMove as any);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [computeCenter]);

  return (
    <div
      // fixed container in bottom-left with a margin — not clipped by canvas
      style={{
        position: "fixed",
        left: margin,
        bottom: margin,
        width: size,
        height: size,
        zIndex: 9999,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        // little visual style
        borderRadius: "50%",
        background: "radial-gradient(ellipse at 50% 65%, rgba(0,0,0,.55), rgba(0,0,0,.35))",
        boxShadow: "0 8px 28px rgba(0,0,0,.35), inset 0 -14px 24px rgba(255,255,255,.08)",
      }}
      ref={baseRef}
      onPointerDown={handlePointerDown}
    >
      <div
        // knob centered + offset via translate
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: knob,
          height: knob,
          borderRadius: "50%",
          transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
          background: "#f1f3f6",
          boxShadow: "0 10px 20px rgba(0,0,0,.25), inset 0 6px 14px rgba(255,255,255,.65)",
          touchAction: "none",
          pointerEvents: "none", // knob doesn't eat events; base handles them
        }}
      />
    </div>
  );
}
