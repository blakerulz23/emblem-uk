'use client';

/**
 * The clubs-page card portal's 3D layer. Loaded only when a visitor asks for
 * it (ClubsCardPortal imports this file on demand), so three.js never ships
 * with the page's first load.
 *
 * Approach adapted from the pmndrs "Enter portals" example (Paul Henschel)
 * and Amir Mushich's "three-small-worlds" study, both MIT licensed: a
 * card-shaped MeshPortalMaterial whose `blend` is eased from 0 to 1 while
 * the camera moves through it. Rebuilt for one card: no models, fonts,
 * decoders or CameraControls (drag/orbit would trap touch scrolling on
 * phones). The miniature pitch is a few procedural meshes.
 */
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MeshPortalMaterial, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { advanceProgress, CARD_HEIGHT, CARD_WIDTH, restingCameraDistance, transitionStages } from './portal-math';

export type CardPortalSceneProps = {
  /** true to move into the card, false to come back out. */
  inside: boolean;
  /** Pause all rendering (off screen or tab hidden). */
  paused: boolean;
  cardImage: string;
  accent: string;
  onReady: () => void;
  onEntered: () => void;
  onExited: () => void;
  onError: () => void;
};

const FOV = 35;
const RADIUS = 0.07;

function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A rounded card plane whose UVs run 0..1 across the card (ShapeGeometry's don't). */
function useCardGeometry() {
  return useMemo(() => {
    const geometry = new THREE.ShapeGeometry(roundedRectShape(CARD_WIDTH, CARD_HEIGHT, RADIUS), 8);
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i += 1) {
      uv.setXY(i, pos.getX(i) / CARD_WIDTH + 0.5, pos.getY(i) / CARD_HEIGHT + 0.5);
    }
    uv.needsUpdate = true;
    return geometry;
  }, []);
}

function useFrameGeometry() {
  return useMemo(() => {
    const outer = roundedRectShape(CARD_WIDTH + 0.03, CARD_HEIGHT + 0.03, RADIUS + 0.015);
    const inner = roundedRectShape(CARD_WIDTH - 0.005, CARD_HEIGHT - 0.005, RADIUS);
    outer.holes.push(new THREE.Path(inner.getPoints(8).reverse()));
    return new THREE.ShapeGeometry(outer, 8);
  }, []);
}

/** Two-tone grass with white markings, drawn once into a small canvas. */
function usePitchTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      for (let i = 0; i < 12; i += 1) {
        ctx.fillStyle = i % 2 ? '#2f8a4c' : '#2a7d45';
        ctx.fillRect(0, i * 32, 256, 32);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeRect(14, 14, 228, 356);
      ctx.beginPath();
      ctx.moveTo(14, 192);
      ctx.lineTo(242, 192);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(128, 192, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(70, 14, 116, 52);
      ctx.strokeRect(70, 318, 116, 52);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

const PLAYERS: Array<{ x: number; z: number; home: boolean }> = [
  { x: -0.35, z: 0.45, home: true },
  { x: 0.3, z: 0.3, home: true },
  { x: 0, z: 0.05, home: true },
  { x: -0.25, z: -0.25, home: true },
  { x: 0.4, z: -0.5, home: false },
  { x: -0.4, z: -0.45, home: false },
  { x: 0.15, z: -0.2, home: false },
  { x: 0, z: -0.95, home: false },
];

/** The miniature match inside the card: pitch, goals, eight players and a moving ball. */
function MiniPitch({ accent }: { accent: string }) {
  const pitch = usePitchTexture();
  const ball = useRef<THREE.Mesh>(null);
  const players = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ball.current) {
      ball.current.position.set(Math.sin(t * 0.9) * 0.42, 0.03 + Math.abs(Math.sin(t * 2.7)) * 0.05, Math.sin(t * 0.55) * 0.75);
    }
    players.current?.children.forEach((child, i) => {
      child.position.y = 0.08 + Math.sin(t * 2 + i) * 0.008;
    });
  });

  return (
    <group position={[0, -0.42, -1.55]} rotation={[0.1, 0, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 2.25]} />
        <meshStandardMaterial map={pitch} roughness={0.95} />
      </mesh>
      {[-1.05, 1.05].map((z) => (
        <mesh key={z} position={[0, 0.06, z]}>
          <boxGeometry args={[0.36, 0.12, 0.04]} />
          <meshStandardMaterial color="#f4f4f2" transparent opacity={0.85} />
        </mesh>
      ))}
      <group ref={players}>
        {PLAYERS.map((p, i) => (
          <mesh key={i} position={[p.x, 0.08, p.z]}>
            <capsuleGeometry args={[0.035, 0.09, 4, 10]} />
            <meshStandardMaterial color={p.home ? accent : '#f4f4f2'} roughness={0.6} />
          </mesh>
        ))}
      </group>
      <mesh ref={ball}>
        <sphereGeometry args={[0.022, 16, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
    </group>
  );
}

function PortalCard(props: Omit<CardPortalSceneProps, 'paused' | 'onError'>) {
  const { inside, cardImage, accent, onReady, onEntered, onExited } = props;
  const art = useTexture(cardImage);
  const geometry = useCardGeometry();
  const frameGeometry = useFrameGeometry();
  const portal = useRef<{ blend: number } | null>(null);
  const artMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const card = useRef<THREE.Group>(null);
  const progress = useRef(0);
  const reported = useRef<'none' | 'entered' | 'exited'>('none');
  const { camera, size } = useThree();

  useMemo(() => {
    art.colorSpace = THREE.SRGBColorSpace;
    art.anisotropy = 4;
  }, [art]);

  useEffect(() => {
    onReady();
    // onReady is stable for the life of the scene
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reported.current = 'none';
  }, [inside]);

  useEffect(() => () => {
    geometry.dispose();
    frameGeometry.dispose();
  }, [geometry, frameGeometry]);

  useFrame(({ clock }, delta) => {
    const target = inside ? 1 : 0;
    progress.current = advanceProgress(progress.current, target, delta);
    const stage = transitionStages(progress.current);

    if (portal.current) portal.current.blend = stage.blend;
    if (artMaterial.current) {
      artMaterial.current.opacity = stage.artOpacity;
      artMaterial.current.visible = stage.artOpacity > 0.001;
    }

    const rest = restingCameraDistance(size.width / Math.max(size.height, 1), FOV);
    camera.position.set(0, stage.camera * 0.06, THREE.MathUtils.lerp(rest, 0.32, stage.camera));
    camera.lookAt(0, -0.12 * stage.camera, -1);

    // A slow idle sway at rest only, so the card reads as a physical object.
    if (card.current) {
      const t = clock.getElapsedTime();
      const sway = 1 - stage.camera;
      card.current.rotation.y = Math.sin(t * 0.6) * 0.12 * sway;
      card.current.rotation.x = Math.sin(t * 0.45) * 0.04 * sway;
    }

    if (progress.current === 1 && inside && reported.current !== 'entered') {
      reported.current = 'entered';
      onEntered();
    }
    if (progress.current === 0 && !inside && reported.current !== 'exited') {
      reported.current = 'exited';
      onExited();
    }
  });

  return (
    <group ref={card}>
      <mesh geometry={frameGeometry} position={[0, 0, -0.001]}>
        <meshBasicMaterial color={accent} transparent opacity={0.9} />
      </mesh>
      <mesh geometry={geometry}>
        <MeshPortalMaterial ref={portal as never} blend={0} resolution={512} side={THREE.DoubleSide}>
          <color attach="background" args={['#173322']} />
          <fog attach="fog" args={['#173322', 2.4, 5]} />
          <hemisphereLight args={['#dfe9ff', '#1a2a1d', 1.1]} />
          <directionalLight position={[1.5, 3, 2]} intensity={1.6} />
          <MiniPitch accent={accent} />
        </MeshPortalMaterial>
      </mesh>
      <mesh geometry={geometry} position={[0, 0, 0.002]}>
        <meshBasicMaterial ref={artMaterial} map={art} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function CardPortalScene({ paused, onError, ...rest }: CardPortalSceneProps) {
  // Unmounting the Canvas deliberately loses its WebGL context (three.js
  // releases it). Only a context lost while the scene is still showing is
  // a real failure.
  const unmounting = useRef(false);
  useEffect(() => {
    unmounting.current = false;
    return () => {
      unmounting.current = true;
    };
  }, []);

  return (
    <Canvas
      className="emh-portal-canvas"
      frameloop={paused ? 'never' : 'always'}
      dpr={[1, 1.5]}
      camera={{ fov: FOV, position: [0, 0, 3], near: 0.02, far: 20 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'default', failIfMajorPerformanceCaveat: false }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          if (unmounting.current) return;
          event.preventDefault();
          onError();
        });
      }}
      aria-hidden="true"
      tabIndex={-1}
    >
      <Suspense fallback={null}>
        <PortalCard {...rest} />
      </Suspense>
    </Canvas>
  );
}
