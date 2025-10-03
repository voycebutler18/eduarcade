// src/features/player/PlayerCapsule.tsx
import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * PlayerCapsule
 * - Draws a translucent capsule aligned to your player (for debugging size/collisions).
 * - Follows targetRef (PlayerController's nodeRef).
 * - Does not affect physics; purely visual.
 *
 * Usage:
 * <PlayerCapsule targetRef={playerRef} radius={0.45} height={0.9} color="#22d3ee" />
 */
export default function PlayerCapsule({
  targetRef,
  radius = 0.45,
  height = 0.9,
  color = "#22d3ee",
  opacity = 0.18,
  wireframe = true,
}: {
  targetRef: React.MutableRefObject<THREE.Object3D | null>;
  radius?: number;     // capsule radius (matches PlayerController radius)
  height?: number;     // cylindrical part height (roughly your rig torso/legs)
  color?: string;
  opacity?: number;
  wireframe?: boolean;
}) {
  const group = useRef<THREE.Group>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    wireframe,
    depthWrite: false,
  }));

  // Build a capsule from primitives (top sphere + cylinder + bottom sphere)
  useEffect(() => {
    const g = group.current;
    if (!g) return;

    g.clear();

    const top = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 16),
      mat.current
    );
    const mid = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 20, 1, true),
      mat.current
    );
    const bot = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 16),
      mat.current
    );

    top.position.y = height / 2;
    mid.position.y = 0;
    bot.position.y = -height / 2;

    g.add(top, mid, bot);

    return () => {
      [top, mid, bot].forEach((m) => {
        m.geometry.dispose();
      });
    };
  }, [radius, height]);

  useFrame(() => {
    const t = targetRef.current;
    if (!t || !group.current) return;
    // follow player transform
    group.current.position.copy(t.position);
    group.current.quaternion.copy(t.quaternion);
  });

  return <group ref={group} />;
}
