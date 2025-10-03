// src/features/player/FollowCam.tsx
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { MutableRefObject, useRef } from "react";

export default function FollowCam({
  targetRef,
  offset = [0, 4.5, 8],
  lerp = 0.12,
}: {
  targetRef: MutableRefObject<THREE.Object3D | null>;
  offset?: [number, number, number];
  lerp?: number; // 0..1 smoothing strength (higher = snappier)
}) {
  const { camera } = useThree();

  // keep vectors stable between frames
  const vTarget = useRef(new THREE.Vector3());
  const vDesired = useRef(new THREE.Vector3());
  const vOffset = useRef(new THREE.Vector3(...offset));

  useFrame((_, dt) => {
    const obj = targetRef.current;
    if (!obj) return;

    // where to be this frame
    vTarget.current.copy(obj.position);
    vDesired.current.copy(vTarget.current).add(vOffset.current);

    // dt-aware interpolation: consistent feel at different framerates
    const factor = 1 - Math.pow(1 - lerp, Math.min(1, dt * 60));
    camera.position.lerp(vDesired.current, factor);
    camera.lookAt(vTarget.current);
  });

  return null;
}
