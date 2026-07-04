'use client';

// src/components/builder/emblem/ModelViewer.tsx
// Tiny GLB viewer using react-three-fiber + drei.
// Loaded with dynamic(import, { ssr: false }) so three.js never reaches the server.

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF, Bounds, useBounds } from '@react-three/drei';
import * as THREE from 'three';

function ModelMesh({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

function AutoFrame({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y += 0.0025;
  });
  return (
    <Bounds fit clip observe margin={1.1}>
      <ResetWatcher />
      <group ref={ref}>{children}</group>
    </Bounds>
  );
}

function ResetWatcher() {
  const bounds = useBounds();
  // Re-frame whenever a new model loads.
  useFrame(() => {
    /* no-op — Bounds itself observes */
  });
  // Trigger an initial refresh after a brief delay so the model has time to mount.
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      try {
        bounds.refresh().clip().fit();
      } catch {}
    }, 200);
  }
  return null;
}

export default function ModelViewer({ url, height = 320 }: { url: string; height?: number }) {
  return (
    <div
      style={{
        width: '100%',
        height,
        borderRadius: 18,
        overflow: 'hidden',
        background: 'radial-gradient(120% 100% at 50% 30%, #f7f7fa 0%, #ececf2 100%)',
        boxShadow: 'inset 0 0 0 1px var(--line)',
      }}
    >
      <Canvas
        camera={{ position: [0, 0.6, 3], fov: 35 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} castShadow />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} />
        <Suspense fallback={null}>
          <Stage environment={null} intensity={0} adjustCamera={false} shadows={false}>
            <AutoFrame>
              <ModelMesh url={url} />
            </AutoFrame>
          </Stage>
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={(Math.PI * 5) / 6}
          minDistance={1.4}
          maxDistance={6}
        />
      </Canvas>
    </div>
  );
}

useGLTF.preload = (() => {}) as unknown as typeof useGLTF.preload;
