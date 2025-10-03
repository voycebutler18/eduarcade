// src/features/ui/HUDOverlay.tsx
import React from "react";

/**
 * HUDOverlay
 * - Simple overlay for debugging.
 * - Shows player position, input direction, and control mode.
 */
export default function HUDOverlay({
  pos,
  dir,
  controlMode,
}: {
  pos: { x: number; z: number };
  dir: { x: number; z: number };
  controlMode: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 20,
        background: "rgba(0,0,0,0.6)",
        color: "#fff",
        padding: "8px 12px",
        borderRadius: 8,
        fontSize: 14,
        lineHeight: 1.4,
        pointerEvents: "none",
      }}
    >
      <div><strong>Position</strong>: {pos.x.toFixed(2)}, {pos.z.toFixed(2)}</div>
      <div><strong>Direction</strong>: {dir.x.toFixed(2)}, {dir.z.toFixed(2)}</div>
      <div><strong>Controls</strong>: {controlMode}</div>
    </div>
  );
}
