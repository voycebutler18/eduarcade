// src/features/controls/DPad.tsx
import React from "react";

/**
 * DPad
 * - Simple 4-way on-screen control.
 * - Updates inputDirRef in the same way as the Thumbstick.
 * - Works with PlayerController without changes.
 */
export default function DPad({
  inputDirRef,
  size = 48,
  gap = 8,
}: {
  inputDirRef: React.MutableRefObject<{ x: number; z: number }>;
  size?: number;
  gap?: number;
}) {
  const handleDown = (x: number, z: number) => {
    inputDirRef.current = { x, z };
  };
  const handleUp = () => {
    inputDirRef.current = { x: 0, z: 0 };
  };

  const btnStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 8,
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.25)",
    color: "#fff",
    fontSize: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 40,
        left: 40,
        display: "grid",
        gridTemplateColumns: `${size}px ${size}px ${size}px`,
        gridTemplateRows: `${size}px ${size}px ${size}px`,
        gap,
      }}
    >
      <div />
      <div
        style={btnStyle}
        onMouseDown={() => handleDown(0, -1)}
        onMouseUp={handleUp}
        onTouchStart={() => handleDown(0, -1)}
        onTouchEnd={handleUp}
      >
        ▲
      </div>
      <div />
      <div
        style={btnStyle}
        onMouseDown={() => handleDown(-1, 0)}
        onMouseUp={handleUp}
        onTouchStart={() => handleDown(-1, 0)}
        onTouchEnd={handleUp}
      >
        ◀
      </div>
      <div />
      <div
        style={btnStyle}
        onMouseDown={() => handleDown(1, 0)}
        onMouseUp={handleUp}
        onTouchStart={() => handleDown(1, 0)}
        onTouchEnd={handleUp}
      >
        ▶
      </div>
      <div />
      <div
        style={btnStyle}
        onMouseDown={() => handleDown(0, 1)}
        onMouseUp={handleUp}
        onTouchStart={() => handleDown(0, 1)}
        onTouchEnd={handleUp}
      >
        ▼
      </div>
      <div />
    </div>
  );
}
