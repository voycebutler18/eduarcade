// src/features/world/SimpleEnvironment.tsx
import { Sky, ContactShadows } from "@react-three/drei";

/**
 * SimpleEnvironment
 * - Adds a ground plane, lighting, and sky so you can see your avatar move.
 * - Meant for testing PlayerController + camera.
 */
export default function SimpleEnvironment() {
  return (
    <>
      {/* Ambient + directional light */}
      <ambientLight intensity={0.4} />
      <directionalLight
        castShadow
        position={[6, 12, 8]}
        intensity={0.9}
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera attach="shadow-camera" args={[-15, 15, 15, -15, 0.5, 50]} />
      </directionalLight>

      {/* Ground plane */}
      <mesh
        receiveShadow
        rotation-x={-Math.PI / 2}
        position={[0, 0, 0]}
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#556677" roughness={1} />
      </mesh>

      {/* Sky dome */}
      <Sky
        sunPosition={[20, 40, 20]}
        inclination={0.55}
        azimuth={0.25}
      />

      {/* Soft contact shadows below player */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.4}
        scale={40}
        blur={2.8}
        far={8}
      />
    </>
  );
}
