"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { STUDIO_DESTINATIONS, type StudioDestination } from "../lib/studio-registry";
import { consumeStudioTravel, markStudioTravel } from "../lib/studio-travel";
import { createStudioProgram, resizeStudioCanvas, studioDprCap, type StudioQualityTier } from "../lib/studio-webgl";
import styles from "./StudioDistrictScene.module.css";

type QualityTier = StudioQualityTier;
type Vec3 = readonly [number, number, number];

type Projection = Readonly<{
  x: number;
  y: number;
  depth: number;
  visible: boolean;
}>;

const VERTEX_SHADER = `
precision highp float;
attribute vec3 a_position;
attribute float a_kind;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_camera;
uniform float u_aspect;
uniform float u_dpr;
uniform float u_time;
uniform float u_focus;
varying float v_kind;
varying float v_focus;
varying float v_depth;

void main() {
  float cy = cos(u_yaw);
  float sy = sin(u_yaw);
  float cx = cos(u_pitch);
  float sx = sin(u_pitch);

  vec3 p = a_position;
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);

  float depth = max(1.4, u_camera - p.z);
  float f = 1.78;
  gl_Position = vec4(
    (p.x * f / max(u_aspect, 0.58)) / depth,
    (p.y * f) / depth,
    clamp((depth - 1.0) / 30.0 * 2.0 - 1.0, -1.0, 1.0),
    1.0
  );

  float portal = step(0.5, a_kind);
  float focused = 1.0 - step(0.5, abs(a_kind - u_focus));
  float pulse = 0.88 + 0.12 * sin(u_time * 1.9 + a_kind * 1.7);
  float baseSize = mix(1.7, 4.6 + focused * 2.4, portal);
  gl_PointSize = clamp(baseSize * (11.0 / depth) * u_dpr * mix(1.0, pulse, portal), 1.0, 14.0 * u_dpr);

  v_kind = a_kind;
  v_focus = focused;
  v_depth = depth;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying float v_kind;
varying float v_focus;
varying float v_depth;

vec3 portalColor(float kind) {
  if (kind < 1.5) return vec3(0.36, 0.96, 0.87);
  if (kind < 2.5) return vec3(0.98, 0.72, 0.36);
  if (kind < 3.5) return vec3(0.91, 0.55, 0.78);
  return vec3(0.55, 0.72, 1.0);
}

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float d = dot(centered, centered);
  if (d > 0.25) discard;

  float portal = step(0.5, v_kind);
  vec3 star = vec3(0.67, 0.83, 0.82);
  vec3 color = mix(star, portalColor(v_kind), portal);
  float radial = 1.0 - smoothstep(0.02, 0.25, d);
  float alpha = mix(clamp(0.54 - v_depth * 0.018, 0.08, 0.34), 0.58 + v_focus * 0.34, portal);
  gl_FragColor = vec4(color, radial * alpha);
}
`;

function seeded(index: number, salt: number): number {
  let value = Math.imul(index + 17, 1103515245) + Math.imul(salt + 31, 12345);
  value ^= value >>> 13;
  value = Math.imul(value, 1274126177);
  return (value >>> 0) / 4294967295;
}

function adaptedPosition(position: Vec3, compact: boolean): Vec3 {
  if (!compact) return position;
  return [position[0] * 0.62, position[1] * 1.08, position[2]];
}

function createSceneData(tier: QualityTier, compact: boolean): Float32Array {
  const data: number[] = [];
  const push = (x: number, y: number, z: number, kind: number) => data.push(x, y, z, kind);

  // Neutral Studio District floor — not a starfield.
  const floorStep = tier === "lite" ? 2.2 : tier === "balanced" ? 1.65 : 1.35;
  for (let x = -12; x <= 12; x += floorStep) {
    for (let z = -8; z <= 7; z += floorStep) {
      const fade = Math.abs(x) + Math.abs(z);
      if (fade > 17 && ((Math.round(x / floorStep) + Math.round(z / floorStep)) % 2)) continue;
      push(x, -3.55, z - 1.5, 0);
    }
  }

  STUDIO_DESTINATIONS.forEach((studio, studioIndex) => {
    const [px, py, pz] = adaptedPosition(studio.position, compact);
    const kind = studioIndex + 1;

    if (studio.id === "sport-fit") {
      // Sport & Fit alone gets a product-universe ring / floating field.
      const ringCount = tier === "lite" ? 24 : 42;
      for (let index = 0; index < ringCount; index += 1) {
        const angle = (index / ringCount) * Math.PI * 2;
        const radius = .88 + .13 * Math.sin(index * 2.1);
        push(px + Math.cos(angle) * radius, py + Math.sin(angle) * radius, pz, kind);
      }
      const floatCount = tier === "lite" ? 8 : 14;
      for (let index = 0; index < floatCount; index += 1) {
        const angle = seeded(index, 21) * Math.PI * 2;
        const radius = 1.2 + seeded(index, 22) * .85;
        push(
          px + Math.cos(angle) * radius,
          py + (seeded(index, 23) - .5) * 1.55,
          pz + Math.sin(angle) * .55,
          kind
        );
      }
      return;
    }

    if (studio.id === "paint-build") {
      // Architectural bay: wall grid + floor/material baseline.
      const cols = tier === "lite" ? 5 : 7;
      const rows = tier === "lite" ? 4 : 6;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          push(
            px + (col - (cols - 1) / 2) * .34,
            py + (row - (rows - 1) / 2) * .30,
            pz,
            kind
          );
        }
      }
      for (let index = -4; index <= 4; index += 1) {
        push(px + index * .32, py - 1.08, pz + .25 + Math.abs(index) * .05, kind);
      }
      return;
    }

    if (studio.id === "style") {
      // Fitting-room doorway + runway leading into it.
      const frameSteps = tier === "lite" ? 6 : 9;
      for (let i = 0; i <= frameSteps; i += 1) {
        const t = i / frameSteps;
        push(px - .76, py - .92 + t * 1.84, pz, kind);
        push(px + .76, py - .92 + t * 1.84, pz, kind);
        push(px - .76 + t * 1.52, py + .92, pz, kind);
      }
      for (let i = 0; i < 7; i += 1) {
        const depth = i * .18;
        const width = .28 + i * .12;
        push(px - width, py - 1.02 - i * .05, pz + depth, kind);
        push(px + width, py - 1.02 - i * .05, pz + depth, kind);
      }
      return;
    }

    // Color Finder: a swatch wall / sample matrix.
    const cols = tier === "lite" ? 4 : 5;
    const rows = tier === "lite" ? 4 : 5;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        push(
          px + (col - (cols - 1) / 2) * .38,
          py + (row - (rows - 1) / 2) * .34,
          pz + ((row + col) % 2) * .05,
          kind
        );
      }
    }
  });

  return new Float32Array(data);
}

function rotate(point: Vec3, yaw: number, pitch: number): [number, number, number] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const [x, y, z] = point;
  const x1 = cy * x + sy * z;
  const z1 = -sy * x + cy * z;
  return [x1, cx * y - sx * z1, sx * y + cx * z1];
}

function project(point: Vec3, yaw: number, pitch: number, camera: number, width: number, height: number): Projection {
  const [x, y, z] = rotate(point, yaw, pitch);
  const depth = camera - z;
  if (!width || !height || depth <= 1.45) return { x: width / 2, y: height / 2, depth, visible: false };
  const aspect = width / height;
  const f = 1.78;
  const ndcX = (x * f / Math.max(aspect, 0.58)) / depth;
  const ndcY = (y * f) / depth;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (0.5 - ndcY * 0.5) * height,
    depth,
    visible: Math.abs(ndcX) < 1.25 && Math.abs(ndcY) < 1.25
  };
}

function qualityTier(width: number): QualityTier {
  const cores = navigator.hardwareConcurrency || 4;
  if (width <= 640 || cores <= 4) return "lite";
  if (width >= 1180 && cores >= 8) return "high";
  return "balanced";
}

function StudioPortal({
  studio,
  index,
  portalRef,
  focused,
  travelling,
  onFocusChange,
  onNavigate
}: {
  studio: StudioDestination;
  index: number;
  portalRef: (node: HTMLAnchorElement | null) => void;
  focused: boolean;
  travelling: boolean;
  onFocusChange: (id?: StudioDestination["id"]) => void;
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>, studio: StudioDestination) => void;
}) {
  return (
    <Link
      ref={portalRef}
      href={studio.href}
      className={styles.portal}
      data-tone={studio.tone}
      data-focused={focused || undefined}
      data-travelling={travelling || undefined}
      onMouseEnter={() => onFocusChange(studio.id)}
      onMouseLeave={() => onFocusChange(undefined)}
      onFocus={() => onFocusChange(studio.id)}
      onBlur={() => onFocusChange(undefined)}
      onClick={(event) => onNavigate(event, studio)}
      style={{ "--studio-order": index } as CSSProperties}
    >
      <span className={styles.portalIndex}>{String(index + 1).padStart(2, "0")}</span>
      <span className={styles.portalMotif} data-kind={studio.id} aria-hidden="true"><i /><i /><i /><i /></span>
      <span className={styles.portalEyebrow}>{studio.eyebrow}</span>
      <strong>{studio.title}</strong>
      <small>{studio.description}</small>
      <b>ENTER <span aria-hidden="true">→</span></b>
    </Link>
  );
}

export function StudioDistrictScene() {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const portalRefs = useRef(new Map<string, HTMLAnchorElement>());
  const animationRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yawRef = useRef(0.08);
  const pitchRef = useRef(-0.035);
  const targetYawRef = useRef(0.08);
  const targetPitchRef = useRef(-0.035);
  const cameraRef = useRef(10.8);
  const focusedIdRef = useRef<StudioDestination["id"] | undefined>(undefined);
  const travellingIdRef = useRef<StudioDestination["id"] | undefined>(undefined);
  const focusedIndexRef = useRef(-1);
  const reducedMotionRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [webglAvailable, setWebglAvailable] = useState(true);
  const [simpleMode, setSimpleMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [focusedId, setFocusedId] = useState<StudioDestination["id"]>();
  const [travellingId, setTravellingId] = useState<StudioDestination["id"]>();
  const [tier, setTier] = useState<QualityTier>("balanced");

  const focusedIndex = useMemo(
    () => STUDIO_DESTINATIONS.findIndex((studio) => studio.id === focusedId),
    [focusedId]
  );

  focusedIdRef.current = focusedId;
  travellingIdRef.current = travellingId;
  focusedIndexRef.current = focusedIndex;
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas || simpleMode) {
      setReady(true);
      return;
    }

    const compact = stage.clientWidth <= 720;
    const nextTier = qualityTier(stage.clientWidth);
    setTier(nextTier);

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: nextTier !== "lite",
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false
    });

    if (!gl) {
      setWebglAvailable(false);
      setReady(true);
      return;
    }

    let disposed = false;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let resizeObserver: ResizeObserver | null = null;

    try {
      const activeProgram = createStudioProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, "studio_district");
      program = activeProgram;
      buffer = gl.createBuffer();
      if (!buffer) throw new Error("studio_buffer_create_failed");

      const sceneData = createSceneData(nextTier, compact);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, sceneData, gl.STATIC_DRAW);
      gl.useProgram(activeProgram);

      const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
      const positionLocation = gl.getAttribLocation(activeProgram, "a_position");
      const kindLocation = gl.getAttribLocation(activeProgram, "a_kind");
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(kindLocation);
      gl.vertexAttribPointer(kindLocation, 1, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

      const yawLocation = gl.getUniformLocation(activeProgram, "u_yaw");
      const pitchLocation = gl.getUniformLocation(activeProgram, "u_pitch");
      const cameraLocation = gl.getUniformLocation(activeProgram, "u_camera");
      const aspectLocation = gl.getUniformLocation(activeProgram, "u_aspect");
      const dprLocation = gl.getUniformLocation(activeProgram, "u_dpr");
      const timeLocation = gl.getUniformLocation(activeProgram, "u_time");
      const focusLocation = gl.getUniformLocation(activeProgram, "u_focus");

      const dprCap = studioDprCap(nextTier, { high: 1.8, balanced: 1.5, lite: 1.15 });
      const resize = () => { resizeStudioCanvas(canvas, stage, gl, dprCap); };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
      resize();

      const render = (time: number) => {
        if (disposed) return;
        if (!document.hidden) {
          const width = stage.clientWidth;
          const height = stage.clientHeight;
          const dpr = Math.min(window.devicePixelRatio || 1, dprCap);

          const activeTravellingId = travellingIdRef.current;
          const activeFocusedId = focusedIdRef.current;
          const destination = activeTravellingId
            ? STUDIO_DESTINATIONS.find((studio) => studio.id === activeTravellingId)
            : activeFocusedId
              ? STUDIO_DESTINATIONS.find((studio) => studio.id === activeFocusedId)
              : undefined;

          if (destination && !reducedMotionRef.current) {
            const [dx, dy] = adaptedPosition(destination.position, width <= 720);
            targetYawRef.current += ((dx > 0 ? -0.12 : 0.12) - targetYawRef.current) * 0.035;
            targetPitchRef.current += ((dy > 0 ? 0.055 : -0.055) - targetPitchRef.current) * 0.03;
          }

          yawRef.current += (targetYawRef.current - yawRef.current) * (reducedMotionRef.current ? 1 : 0.055);
          pitchRef.current += (targetPitchRef.current - pitchRef.current) * (reducedMotionRef.current ? 1 : 0.055);
          const targetCamera = activeTravellingId ? 8.2 : 10.8;
          cameraRef.current += (targetCamera - cameraRef.current) * (reducedMotionRef.current ? 1 : 0.07);

          gl.clearColor(0.014, 0.027, 0.025, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(activeProgram);
          gl.uniform1f(yawLocation, yawRef.current);
          gl.uniform1f(pitchLocation, pitchRef.current);
          gl.uniform1f(cameraLocation, cameraRef.current);
          gl.uniform1f(aspectLocation, width / Math.max(1, height));
          gl.uniform1f(dprLocation, dpr);
          gl.uniform1f(timeLocation, time / 1000);
          gl.uniform1f(focusLocation, focusedIndexRef.current >= 0 ? focusedIndexRef.current + 1 : -1);
          gl.drawArrays(gl.POINTS, 0, sceneData.length / 4);

          STUDIO_DESTINATIONS.forEach((studio) => {
            const node = portalRefs.current.get(studio.id);
            if (!node) return;
            const projection = project(
              adaptedPosition(studio.position, width <= 720),
              yawRef.current,
              pitchRef.current,
              cameraRef.current,
              width,
              height
            );
            const scale = Math.max(0.74, Math.min(1.08, 10.2 / Math.max(7.5, projection.depth)));
            node.style.setProperty("--portal-x", `${projection.x}px`);
            node.style.setProperty("--portal-y", `${projection.y}px`);
            node.style.setProperty("--portal-scale", scale.toFixed(3));
            node.style.setProperty("--portal-opacity", projection.visible ? "1" : "0");
          });
        }

        animationRef.current = window.requestAnimationFrame(render);
      };

      setWebglAvailable(true);
      setReady(true);
      animationRef.current = window.requestAnimationFrame(render);
    } catch (error) {
      console.error("[studios] WebGL hub unavailable", error);
      setWebglAvailable(false);
      setReady(true);
    }

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    };
  }, [simpleMode]);

  useEffect(() => {
    const marker = consumeStudioTravel("hub");
    if (marker?.from && marker.from !== "hub") {
      const studio = STUDIO_DESTINATIONS.find((item) => item.id === marker.from);
      if (studio) {
        setFocusedId(studio.id);
        setTravellingId(studio.id);
        cameraRef.current = 8.35;
        const [dx, dy] = adaptedPosition(studio.position, window.innerWidth <= 720);
        targetYawRef.current = dx > 0 ? -0.12 : 0.12;
        targetPitchRef.current = dy > 0 ? 0.055 : -0.055;
        returnTimerRef.current = setTimeout(() => {
          setTravellingId(undefined);
          setFocusedId(undefined);
        }, 620);
      }
    }
    return () => {
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
      if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (focusedId || travellingId) return;
    targetYawRef.current = 0.08;
    targetPitchRef.current = -0.035;
  }, [focusedId, travellingId]);

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (simpleMode || reducedMotion || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    targetYawRef.current = x * -0.16;
    targetPitchRef.current = y * -0.075;
  }

  function handlePointerLeave() {
    if (focusedId || travellingId) return;
    targetYawRef.current = 0.08;
    targetPitchRef.current = -0.035;
  }

  function handleNavigate(event: ReactMouseEvent<HTMLAnchorElement>, studio: StudioDestination) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (simpleMode || reducedMotion || !webglAvailable) return;
    event.preventDefault();
    markStudioTravel("hub", studio.id);
    setFocusedId(studio.id);
    setTravellingId(studio.id);
    navigationTimerRef.current = setTimeout(() => router.push(studio.href), 520);
  }

  const staticPresentation = simpleMode || !webglAvailable || !ready;

  return (
    <section
      ref={stageRef}
      className={`${styles.stage} ${ready ? styles.ready : ""} ${staticPresentation ? styles.staticMode : ""}`}
      data-travelling={travellingId || undefined}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-labelledby="studios-title"
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />

      <div className={styles.topBar}>
        <Link href="/" className={styles.homeLink}>← ΚΟΝΤΑ ΜΟΥ</Link>
        <div className={styles.wordmark}>
          <strong>STUDIOS</strong>
          <span>by KONTA MOY</span>
        </div>
        <button
          type="button"
          className={styles.modeButton}
          aria-pressed={simpleMode}
          onClick={() => {
            setSimpleMode((current) => !current);
            setTravellingId(undefined);
          }}
        >
          {simpleMode ? "3D προβολή" : "Απλή προβολή"}
        </button>
      </div>

      <div className={styles.heroCopy}>
        <span>KONTA MOY · INTERACTIVE STUDIOS</span>
        <h1 id="studios-title">Μπες μέσα.<br /><em>Βρες το σωστό.</em></h1>
        <p>
          Τέσσερα εξειδικευμένα περιβάλλοντα. Η ίδια λογική αγοράς:
          πραγματικά προϊόντα, πραγματική διαθεσιμότητα και καθοδήγηση πριν από την επιλογή.
        </p>
      </div>

      <div className={styles.core} aria-hidden="true">
        <span />
        <i />
        <b />
      </div>

      <nav className={styles.portalLayer} aria-label="KONTA MOY Studios">
        {STUDIO_DESTINATIONS.map((studio, index) => (
          <StudioPortal
            key={studio.id}
            studio={studio}
            index={index}
            portalRef={(node) => {
              if (node) portalRefs.current.set(studio.id, node);
              else portalRefs.current.delete(studio.id);
            }}
            focused={focusedId === studio.id}
            travelling={travellingId === studio.id}
            onFocusChange={setFocusedId}
            onNavigate={handleNavigate}
          />
        ))}
      </nav>

      <div className={styles.statusBar}>
        <span>{webglAvailable && !simpleMode ? `3D ENGINE · ${tier.toUpperCase()}` : "SEMANTIC FALLBACK"}</span>
        <p>{simpleMode ? "Διάλεξε Studio από τη λίστα." : "Tap ένα Studio για να μπεις · η πλοήγηση παραμένει κανονικό URL."}</p>
      </div>

      <p className={styles.srStatus} aria-live="polite">
        {travellingId ? `Μετάβαση στο ${STUDIO_DESTINATIONS.find((studio) => studio.id === travellingId)?.title ?? "Studio"}` : ""}
      </p>
    </section>
  );
}
