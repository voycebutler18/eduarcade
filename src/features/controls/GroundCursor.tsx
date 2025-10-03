// src/features/controls/GroundCursor.tsx
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";

/**
 * GroundCursor
 * - Shows a pulsing ring where you click on the ground (y=planeY).
 * - Purely visual — pairs nicely with ClickToMove, but does not modify input.
 * - If you want it to mirror ClickToMove exactly, mount both so they listen to the same clicks.
 */
export default function GroundCursor({
  planeY = 0,
  color = "#22d3ee",
  baseRadius = 0.35,
  maxPulse = 0.65,
  fadeMs = 900,
}: {
  planeY?: number;
  color?: string;
  baseRadius?: number;
  maxPulse?: number;
  fadeMs?: number;
}) {
  const { gl, camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const ringRef = useRef<THREE.Mesh>(null);

  const [pos, setPos] = useState<THREE.Vector3 | null>(null);
  const startMs = useRef(0);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera({ x, y }, camera);
      const dirY = raycaster.current.ray.direction.y;
      if (Math.abs(dirY) < 1e-6) return; // avoid div by zero

      const t = (planeY - raycaster.current.ray.origin.y) / dirY;
      if (t > 0) {
        const p = raycaster.current.ray.origin
          .clone()
          .add(raycaster.current.ray.direction.clone().multiplyScalar(t));
        setPos(p);
        startMs.current = performance.now();
      }
    };

    gl.domElement.addEventListener("click", onClick);
    return () => gl.domElement.removeEventListener("click", onClick);
  }, [gl, camera, planeY]);

  useFrame(() => {
    if (!ringRef.current || !pos) return;
    const now = performance.now();
    const dt = now - startMs.current;
    if (dt > fadeMs) {
      // end of pulse
      ringRef.current.visible = false;
      return;
    }
    ringRef.current.visible = true;

    // Pulse radius  -> baseRadius .. maxPulse
    const k = dt / fadeMs;
    const ease = 1 - Math.pow(1 - k, 2); // ease-out
    const r = baseRadius + (maxPulse - baseRadius) * ease;
    ringRef.current.scale.setScalar(r / baseRadius);

    // Fade alpha 1 -> 0
    const mat = ringRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 1 - k;

    // Keep ring just above ground to avoid z-fighting
    ringRef.current.position.set(pos.x, planeY + 0.01, pos.z);
  });

  return (
    <mesh
      ref={ringRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, planeY + 0.01, 0]}
      visible={false}
    >
      {/* Thin donut ring */}
      <ringGeometry args={[baseRadius * 0.82, baseRadius, 48]} />
      <meshBasicMaterial color={color} transparent opacity={1} />
    </mesh>
  );
}
