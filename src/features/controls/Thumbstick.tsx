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
  const [active, setActive] = useState(false);
  const center = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const radius = size / 2;
  const DEAD = 0.18; // dead-zone

  // position the knob by setting CSS vars (so we can keep -50% centering)
  const setKnob = (dx: number, dy: number) => {
    const el = wrapRef.current;
    if (!el) return;
    el.style.setProperty("--dx", `${dx}px`);
    el.style.setProperty("--dy", `${dy}px`);
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const processMove = (clientX: number, clientY: number) => {
      const dx = clientX - center.current.x;
      const dy = clientY - center.current.y;

      // map to stick space: x right, y down; world uses XZ, so z = -y
      const dist = Math.hypot(dx, dy);
      const maxTravel = radius - knob / 2;
      const mag = dist > 0 ? Math.min(dist, maxTravel) : 0;

      // normalized local direction
      const nx = dist ? dx / dist : 0;
      const ny = dist ? dy / dist : 0;

      // move the knob visually relative to center
      setKnob(nx * mag, ny * mag);

      // emit direction with dead-zone
      const outMag = Math.hypot(nx, ny);
      if (outMag <= DEAD) {
        onChange?.({ x: 0, z: 0 });
      } else {
        // normalize to unit vector
        onChange?.({ x: nx / outMag, z: -ny / outMag });
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      setActive(true);
      const r = el.getBoundingClientRect();
      center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      processMove(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!active) return;
      e.preventDefault();
      processMove(e.clientX, e.clientY);
    };

    const end = (e: PointerEvent) => {
      e.preventDefault();
      setActive(false);
      setKnob(0, 0);          // snap to center
      onChange?.({ x: 0, z: 0 }); // stop
      try { el.releasePointerCapture?.(e.pointerId); } catch {}
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: false });
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", end, { passive: false });
    el.addEventListener("pointercancel", end, { passive: false });
    el.addEventListener("contextmenu", ev => ev.preventDefault());

    // initial center
    setKnob(0, 0);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown as any);
      el.removeEventListener("pointermove", onPointerMove as any);
      el.removeEventListener("pointerup", end as any);
      el.removeEventListener("pointercancel", end as any);
    };
  }, [active, radius, knob, onChange]);

  return (
    <div
      ref={wrapRef}
      className="thumbstick-wrap"
      style={{
        width: size,
        height: size,
        borderRadius: size,
        // helpful defaults; your app.css overrides below will style it
        position: "relative",
      }}
    >
      <div className="thumbstick-knob" style={{ width: knob, height: knob, borderRadius: knob }} />
    </div>
  );
}
