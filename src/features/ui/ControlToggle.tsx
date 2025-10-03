// src/features/ui/ControlToggle.tsx
import { useState } from "react";
import Thumbstick from "../controls/Thumbstick";
import DPad from "../controls/DPad";

/**
 * ControlToggle
 * - Lets player switch between Thumbstick and DPad on-screen controls.
 * - Stores selection in local state (you can extend to localStorage if needed).
 */
export default function ControlToggle({
  inputDirRef,
}: {
  inputDirRef: React.MutableRefObject<{ x: number; z: number }>;
}) {
  const [mode, setMode] = useState<"thumbstick" | "dpad">("thumbstick");

  return (
    <>
      {/* UI to switch mode */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          background: "rgba(0,0,0,0.5)",
          padding: "6px 10px",
          borderRadius: 8,
          color: "#fff",
          fontSize: 14,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() =>
          setMode((m) => (m === "thumbstick" ? "dpad" : "thumbstick"))
        }
      >
        Controls: {mode === "thumbstick" ? "Thumbstick" : "DPad"} (click to switch)
      </div>

      {/* Render the active control */}
      <div style={{ position: "absolute", bottom: 40, left: 40 }}>
        {mode === "thumbstick" ? (
          <Thumbstick
            onChange={(dir) => {
              if (dir) inputDirRef.current = dir;
              else inputDirRef.current = { x: 0, z: 0 };
            }}
          />
        ) : (
          <DPad inputDirRef={inputDirRef} />
        )}
      </div>
    </>
  );
}
