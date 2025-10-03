// src/features/controls/ClickToMove.tsx
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useRef } from "react";

/**
 * ClickToMove
 * - Lets the user click/tap on the ground plane (y=planeY).
 * - Moves the player toward that clicked point by writing into inputDirRef.
 * - Works with existing PlayerController (same normalized {x,z} input).
 */
export default function ClickToMove({
  inputDirRef,
  getPlayerPos,
  planeY = 0,
  arriveDist = 0.12,
}: {
  inputDirRef: React.MutableRefObject<{ x: number; z: number }>;
  getPlayerPos: () => { x: number; z: number };
  planeY?: number;   // y height of the ground plane
  arriveDist?: number; // stop radius
}) {
  const { gl, camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const target = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera({ x, y }, camera);
      // intersect with infinite XZ plane at y = planeY
      const t =
        (planeY - raycaster.current.ray.origin.y) /
        raycaster.current.ray.direction.y;
      if (t > 0) {
        target.current = raycaster.current.ray.origin
          .clone()
          .add(raycaster.current.ray.direction.clone().multiplyScalar(t));
      }
    };

    gl.domElement.addEventListener("click", onClick);
    return () => gl.domElement.removeEventListener("click", onClick);
  }, [gl, camera, planeY]);

  useFrame(() => {
    if (!target.current) return;
    const p = getPlayerPos();
    const dx = target.current.x - p.x;
    const dz = target.current.z - p.z;
    const d = Math.hypot(dx, dz);

    if (d < arriveDist) {
      target.current = null;
      inputDirRef.current = { x: 0, z: 0 };
      return;
    }
    inputDirRef.current = { x: dx / d, z: dz / d };
  });

  return null;
}
