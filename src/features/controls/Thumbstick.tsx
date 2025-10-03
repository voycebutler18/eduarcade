// src/features/controls/Thumbstick.tsx
import React, { useEffect, useRef, useState } from "react";

type Vec = { x: number; z: number };

export default function Thumbstick({
  size = 120,
  knob = 56,
  dead = 0.08,
  onChange,
}: {
  size?: number;
  knob?: number;
  dead?: number; // 0..1
  onChange?: (v: Vec | null) => void;
}) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // -1..1 in pad space

  // Emit vector in XZ plane (x, z)
  useEffect(() => {
    const mag = Math.hypot(pos.x, pos.y);
    if (!dragging || mag < dead) {
      onChange?.(null);
      return;
    }
    const nx = pos.x / (mag || 1);
    const ny = pos.y / (mag || 1);
    // screen-space y+ is down; convert to forward(-z)
    onChange?.({ x: nx, z: -ny });
  }, [pos, dragging, dead, onChange]);

  function handleStart(clientX: number, clientY: number) {
    setDragging(true);
    update(clientX, clientY);
  }

  function handleMove(clientX: number, clientY: number) {
    if (!dragging) return;
    update(clientX, clientY);
  }

  function handleEnd() {
    setDragging(false);
    setPos({ x: 0, y: 0 });
    onChange?.(null);
  }

  function update(clientX: number, clientY: number) {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = (clientX - cx) / (rect.width / 2);  // -1..1
    let dy = (clientY - cy) / (rect.height / 2); // -1..1
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    setPos({ x: dx, y: dy });
  }

  // mouse
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging) return;
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    }
    function onUp() {
      if (!dragging) return;
      handleEnd();
    }
    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // touch
  useEffect(() => {
    function onMove(e: TouchEvent) {
      if (!dragging) return;
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      handleMove(t.clientX, t.clientY);
    }
    function onEnd() {
      if (!dragging) return;
      handleEnd();
    }
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [dragging]);

  const pad = size;
  const k = knob;
  const knobX = (pad - k) / 2 * (pos.x);
  const knobY = (pad - k) / 2 * (pos.y);

  return (
    <div
      ref={padRef}
      onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) handleStart(t.clientX, t.clientY);
      }}
      style={{
        width: pad,
        height: pad,
        margin: 10,
        borderRadius: pad,
        border: "1px solid rgba(255,255,255,.18)",
        background: "rgba(0,0,0,.35)",
        position: "relative",
        touchAction: "none",
        userSelect: "none",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          width: k,
          height: k,
          borderRadius: k,
          position: "absolute",
          left: (pad - k) / 2 + knobX,
          top: (pad - k) / 2 + knobY,
          background: "rgba(255,255,255,.9)",
          boxShadow: "0 6px 20px rgba(0,0,0,.35)",
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}
