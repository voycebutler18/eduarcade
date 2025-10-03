// src/features/controls/MobileJumpButton.tsx
import React, { useRef } from "react";

/**
 * MobileJumpButton
 * - Big round button for touch devices to trigger jump.
 * - Sets:
 *    jumpRef.current = true   (edge press)
 *    jumpHeldRef.current=true/false (while pressed)
 *
 * Usage:
 * const jumpRef = useRef(false);
 * const jumpHeldRef = useRef(false);
 * <MobileJumpButton jumpRef={jumpRef} jumpHeldRef={jumpHeldRef} />
 *
 * Works with the PlayerController (#21) that supports variable height jumps.
 */
export default function MobileJumpButton({
  jumpRef,
  jumpHeldRef,
  size = 84,
  bottom = 40,
  right = 40,
  label = "Jump",
}: {
  jumpRef: React.MutableRefObject<boolean>;
  jumpHeldRef: React.MutableRefObject<boolean>;
  size?: number;
  bottom?: number;
  right?: number;
  label?: string;
}) {
  const holding = useRef(false);

  const press = () => {
    holding.current = true;
    jumpHeldRef.current = true;
    // one-shot edge for buffered/coyote jump in PlayerController
    jumpRef.current = true;
  };
  const release = () => {
    holding.current = false;
    jumpHeldRef.current = false;
  };

  const styleWrap: React.CSSProperties = {
    position: "fixed",
    bottom,
    right,
    zIndex: 60,
    userSelect: "none",
    touchAction: "none",
  };

  const styleBtn: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "radial-gradient(closest-side, rgba(255,255,255,0.9), rgba(255,255,255,0.65))",
    boxShadow: "0 10px 24px rgba(0,0,0,0.35), inset 0 2px 4px rgba(255,255,255,0.6)",
    border: "1px solid rgba(255,255,255,0.7)",
    fontWeight: 700,
    fontSize: 14,
    color: "#0b1222",
    letterSpacing: 0.5,
  };

  return (
    <div style={styleWrap}>
      <div
        style={styleBtn}
        onMouseDown={press}
        onMouseUp={release}
        onMouseLeave={() => holding.current && release()}
        onTouchStart={(e) => {
          e.preventDefault();
          press();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          release();
        }}
      >
        {label}
      </div>
    </div>
  );
}
