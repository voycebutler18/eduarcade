// src/features/controls/Thumbstick.tsx
import { useEffect, useRef, useState } from "react";

type Vec = { x: number; z: number };
type Props = {
  size?: number;          // outer diameter (px)
  knob?: number;          // knob diameter (px)
  onChange?: (dir: Vec | null) => void; // normalized dir or null when idle
};

export default function Thumbstick({ size = 140, knob = 56, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const center = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const radius = size / 2;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      setActive(true);

      const r = el.getBoundingClientRect();
      center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      processMove(e);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!active) return;
      e.preventDefault();
      processMove(e);
    };

    const onPointerUp = (e: PointerEvent) => {
      e.preventDefault();
      setActive(false);
      setKnob(0, 0);
      onChange?.(null);
      try { el.releasePointerCapture(e.pointerId); } catch {}
    };

    const processMove = (e: PointerEvent) => {
      const dx = e.clientX - center.current.x;
      const dy = e.clientY - center.current.y;
      // stick space: x right, y down; we want XZ plane, so invert y->z
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, radius - knob / 2);
      const nx = dist ? dx / dist : 0;
      const ny = dist ? dy / dist : 0;

      // position the knob
      setKnob(nx * clamped, ny * clamped);

      // send normalized direction in XZ (z forward = -ny)
      onChange?.({ x: nx, z: -ny });
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: false });
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", onPointerUp, { passive: false });
    el.addEventListener("pointercancel", onPointerUp, { passive: false });
    // prevent context menu long-press
    el.addEventListener("contextmenu", (ev) => ev.preventDefault());

    return () => {
      el.removeEventListener("pointerdown", onPointerDown as any);
      el.removeEventListener("pointermove", onPointerMove as any);
      el.removeEventListener("pointerup", onPointerUp as any);
      el.removeEventListener("pointercancel", onPointerUp as any);
    };
  }, [active, radius, knob, onChange]);

  function setKnob(dx: number, dy: number) {
    const k = knobRef.current;
    if (!k) return;
    // translate within the wrap
    k.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  return (
    <div
      ref={wrapRef}
      className="thumbstick-wrap"
      style={{
        width: size,
        height: size,
        borderRadius: size,
      }}
    >
      <div
        ref={knobRef}
        className="thumbstick-knob"
        style={{
          width: knob,
          height: knob,
          borderRadius: knob,
          transform: `translate(0px, 0px)`,
        }}
      />
    </div>
  );
}
