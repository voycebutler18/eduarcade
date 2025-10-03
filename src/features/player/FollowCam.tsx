// src/features/player/FollowCam.tsx
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useRef } from "react";

export default function FollowCam({
  targetRef,
  offset = [0, 4.5, 8],
  lerp = 0.12,
}: {
  targetRef: React.RefObject<THREE.Object3D>;
  offset?: [number, number, number];
  lerp?: number; // 0..1 per 60fps
}) {
  const { camera } = useThree();

  // internal cached vectors (avoid allocations every frame)
  const initialized = useRef(false);
  const targetPos = useRef(new THREE.Vector3());
  const desiredPos = useRef(new THREE.Vector3());
  const currentPos = useRef(new THREE.Vector3());
  const off = useRef(new THREE.Vector3(...offset));

  useFrame((_, delta) => {
    const t = targetRef.current;
    if (!t) return;

    // read the player world position
    t.getWorldPosition(targetPos.current);

    // desired camera pos = player + offset
    desiredPos.current.copy(targetPos.current).add(off.current);

    // init once to avoid a giant jump the first frame
    if (!initialized.current) {
      currentPos.current.copy(desiredPos.current);
      camera.position.copy(currentPos.current);
      camera.lookAt(targetPos.current);
      initialized.current = true;
      return;
    }

    // framerate-independent smoothing:
    // convert "lerp per 60fps" into per-frame alpha
    const alpha = 1 - Math.pow(1 - lerp, Math.min(1, delta * 60));

    // smooth position
    currentPos.current.lerp(desiredPos.current, alpha);

    // apply
    camera.position.copy(currentPos.current);
    camera.lookAt(targetPos.current);
  });

  return null;
}
