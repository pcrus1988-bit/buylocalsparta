"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./SportFitWebGLUniverse.module.css";

export type SportFitVisualProduct = Readonly<{
  id: string;
  familyId?: string;
  slug?: string;
  title: string;
  brand?: string;
  categoryLabel?: string;
  previewImageSrc?: string;
  priceMinor?: number;
  score?: number;
}>;

type Mode = "cloud" | "finalists";

type Props = Readonly<{
  products: readonly SportFitVisualProduct[];
  leavingIds?: ReadonlySet<string>;
  mode?: Mode;
  selectedId?: string;
  onSelect?: (id: string) => void;
  className?: string;
  ariaLabel?: string;
}>;

type NodeState = {
  id: string;
  product: SportFitVisualProduct;
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  scale: number;
  tscale: number;
  opacity: number;
  topacity: number;
  phase: number;
  texture: WebGLTexture | null;
  retiring: boolean;
  imageRequested: boolean;
  screenX: number;
  screenY: number;
  screenRadius: number;
};

type Runtime = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  textureLocation: WebGLUniformLocation | null;
  worldLocation: WebGLUniformLocation | null;
  sizeLocation: WebGLUniformLocation | null;
  opacityLocation: WebGLUniformLocation | null;
  rotationLocation: WebGLUniformLocation | null;
  aspectLocation: WebGLUniformLocation | null;
  cameraLocation: WebGLUniformLocation | null;
  nodes: Map<string, NodeState>;
  yaw: number;
  pitch: number;
  targetYaw: number;
  targetPitch: number;
  zoom: number;
  width: number;
  height: number;
  reducedMotion: boolean;
  raf: number;
  disposed: boolean;
};

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
uniform vec3 u_world;
uniform float u_size;
uniform vec2 u_rotation;
uniform float u_aspect;
uniform float u_camera;

vec3 rotateScene(vec3 p) {
  float cy = cos(u_rotation.x);
  float sy = sin(u_rotation.x);
  float cp = cos(u_rotation.y);
  float sp = sin(u_rotation.y);

  vec3 yawed = vec3(
    p.x * cy - p.z * sy,
    p.y,
    p.x * sy + p.z * cy
  );

  return vec3(
    yawed.x,
    yawed.y * cp - yawed.z * sp,
    yawed.y * sp + yawed.z * cp
  );
}

void main() {
  vec3 p = rotateScene(u_world);
  float depth = max(1.3, u_camera - p.z);
  float focal = 2.42;
  vec2 center = vec2((p.x / depth) * focal / u_aspect, (p.y / depth) * focal);
  float sprite = (u_size / depth) * focal;
  vec2 offset = vec2(a_position.x * sprite / u_aspect, a_position.y * sprite);
  float z = clamp((depth - 1.3) / 18.0, 0.0, 1.0) * 2.0 - 1.0;

  gl_Position = vec4(center + offset, z, 1.0);
  v_uv = a_uv;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_opacity;

void main() {
  vec2 centered = v_uv - vec2(0.5);
  float d = length(centered);
  if (d > 0.5) discard;

  vec4 tex = texture2D(u_texture, v_uv);
  float rim = smoothstep(0.50, 0.43, d) - smoothstep(0.43, 0.38, d);
  float softEdge = smoothstep(0.50, 0.465, d);
  vec3 glow = vec3(0.96, 0.93, 0.84) * rim * 0.36;
  gl_FragColor = vec4(tex.rgb + glow, tex.a * softEdge * u_opacity);
}
`;

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("sport_fit_webgl_shader_create_failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "sport_fit_webgl_shader_compile_failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("sport_fit_webgl_program_create_failed");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "sport_fit_webgl_program_link_failed";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function uploadCanvasTexture(gl: WebGLRenderingContext, source: HTMLCanvasElement, texture?: WebGLTexture | null): WebGLTexture {
  const next = texture || gl.createTexture();
  if (!next) throw new Error("sport_fit_webgl_texture_create_failed");
  gl.bindTexture(gl.TEXTURE_2D, next);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  return next;
}

function fallbackTexture(gl: WebGLRenderingContext, product: SportFitVisualProduct): WebGLTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("sport_fit_webgl_fallback_canvas_failed");
  const gradient = context.createRadialGradient(78, 62, 16, 96, 96, 120);
  gradient.addColorStop(0, "#fffef9");
  gradient.addColorStop(0.52, "#e9e2d5");
  gradient.addColorStop(1, "#b8ad9b");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 192, 192);
  context.strokeStyle = "rgba(25,24,20,.28)";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(96, 96, 88, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#171713";
  context.font = "700 66px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText((product.brand || product.title || "S").slice(0, 1).toUpperCase(), 96, 92);
  context.font = "700 15px Arial, sans-serif";
  context.fillText((product.brand || "SPORT").slice(0, 18).toUpperCase(), 96, 145);
  return uploadCanvasTexture(gl, canvas);
}

function uploadProductImage(runtime: Runtime, node: NodeState) {
  if (node.imageRequested) return;
  node.imageRequested = true;
  const image = new Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";
  image.src = `/api/catalog-source-image/${encodeURIComponent(node.product.id)}`;

  image.onload = () => {
    if (runtime.disposed || !runtime.nodes.has(node.id)) return;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, 256, 256);
    context.fillStyle = "#f6f2e9";
    context.fillRect(0, 0, 256, 256);

    const sourceRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
    const targetRatio = 1;
    let width = 256;
    let height = 256;
    let x = 0;
    let y = 0;
    if (sourceRatio > targetRatio) {
      height = 256 / sourceRatio;
      y = (256 - height) / 2;
    } else {
      width = 256 * sourceRatio;
      x = (256 - width) / 2;
    }
    context.drawImage(image, x, y, width, height);

    try {
      node.texture = uploadCanvasTexture(runtime.gl, canvas, node.texture);
    } catch {
      // Keep the deterministic fallback texture.
    }
  };
}

function cloudTarget(product: SportFitVisualProduct): [number, number, number, number] {
  const seed = hash(product.familyId || product.id);
  const angle = ((seed % 3600) / 3600) * Math.PI * 2;
  const vertical = (((seed >>> 10) % 2000) / 1000 - 1) * 3.2;
  const rawScore = typeof product.score === "number" ? product.score : 48;
  const score01 = Math.max(0, Math.min(1, rawScore / 100));
  const radius = typeof product.score === "number"
    ? 2.2 + (1 - score01) * 3.2
    : 4.2 + ((seed >>> 20) % 170) / 100;
  const depthJitter = (((seed >>> 17) % 200) / 100 - 1) * 1.35;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius + depthJitter;
  const y = vertical * (0.72 + (1 - score01) * 0.16);
  const size = 0.74 + ((seed >>> 5) % 18) / 100 + score01 * 0.42;
  return [x, y, z, size];
}

function finalistTarget(index: number, count: number, selected: boolean): [number, number, number, number] {
  const center = (count - 1) / 2;
  const offset = index - center;
  const x = offset * 2.35;
  const y = -Math.abs(offset) * 0.18 + (selected ? 0.26 : 0);
  const z = 2.35 - Math.abs(offset) * 0.72 + (selected ? 0.72 : 0);
  const size = selected ? 1.72 : 1.34;
  return [x, y, z, size];
}

function rotatePoint(x: number, y: number, z: number, yaw: number, pitch: number): [number, number, number] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const yx = x * cy - z * sy;
  const yz = x * sy + z * cy;
  return [yx, y * cp - yz * sp, y * sp + yz * cp];
}

function syncNodes(runtime: Runtime, products: readonly SportFitVisualProduct[], leavingIds: ReadonlySet<string>, mode: Mode, selectedId?: string) {
  const live = new Set(products.map((product) => product.id));
  const visualProducts = runtime.width < 620 && mode === "cloud" ? products.slice(0, 42) : products;

  visualProducts.forEach((product, index) => {
    let node = runtime.nodes.get(product.id);
    const target = mode === "finalists"
      ? finalistTarget(index, Math.min(5, visualProducts.length), product.id === selectedId)
      : cloudTarget(product);

    if (!node) {
      const seed = hash(product.id);
      const spread = mode === "finalists" ? 7.2 : 7.8;
      const angle = ((seed % 1000) / 1000) * Math.PI * 2;
      node = {
        id: product.id,
        product,
        x: Math.cos(angle) * spread,
        y: (((seed >>> 7) % 1000) / 1000 - 0.5) * 7,
        z: -4 - ((seed >>> 17) % 250) / 100,
        tx: target[0],
        ty: target[1],
        tz: target[2],
        scale: 0.14,
        tscale: target[3],
        opacity: 0,
        topacity: 1,
        phase: ((seed >>> 9) % 628) / 100,
        texture: fallbackTexture(runtime.gl, product),
        retiring: false,
        imageRequested: false,
        screenX: -999,
        screenY: -999,
        screenRadius: 0
      };
      runtime.nodes.set(product.id, node);
    }

    node.product = product;
    node.tx = target[0];
    node.ty = target[1];
    node.tz = target[2];
    node.tscale = target[3];
    node.retiring = false;
    node.topacity = 1;

    if (leavingIds.has(product.id)) {
      const length = Math.max(1, Math.hypot(node.tx, node.ty, node.tz));
      node.tx += (node.tx / length) * 7;
      node.ty += (node.ty / length) * 5;
      node.tz -= 4;
      node.tscale *= 0.34;
      node.topacity = 0;
      node.retiring = true;
    }

    uploadProductImage(runtime, node);
  });

  for (const node of runtime.nodes.values()) {
    if (!live.has(node.id)) {
      node.retiring = true;
      node.topacity = 0;
      node.tscale *= 0.45;
      const length = Math.max(1, Math.hypot(node.x, node.y, node.z));
      node.tx += (node.x / length) * 5.5;
      node.ty += (node.y / length) * 4;
      node.tz -= 4;
    }
  }
}

export function SportFitWebGLUniverse({
  products,
  leavingIds = new Set<string>(),
  mode = "cloud",
  selectedId,
  onSelect,
  className = "",
  ariaLabel = "Τρισδιάστατο WebGL σύμπαν προϊόντων"
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const propsRef = useRef({ products, leavingIds, mode, selectedId, onSelect });
  const [supported, setSupported] = useState(true);

  propsRef.current = { products, leavingIds, mode, selectedId, onSelect };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance"
    });
    if (!gl) {
      setSupported(false);
      return;
    }

    let runtime: Runtime;
    try {
      const program = createProgram(gl);
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("sport_fit_webgl_buffer_create_failed");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 0, 1,
         1, -1, 1, 1,
        -1,  1, 0, 0,
        -1,  1, 0, 0,
         1, -1, 1, 1,
         1,  1, 1, 0
      ]), gl.STATIC_DRAW);

      runtime = {
        gl,
        program,
        buffer,
        textureLocation: gl.getUniformLocation(program, "u_texture"),
        worldLocation: gl.getUniformLocation(program, "u_world"),
        sizeLocation: gl.getUniformLocation(program, "u_size"),
        opacityLocation: gl.getUniformLocation(program, "u_opacity"),
        rotationLocation: gl.getUniformLocation(program, "u_rotation"),
        aspectLocation: gl.getUniformLocation(program, "u_aspect"),
        cameraLocation: gl.getUniformLocation(program, "u_camera"),
        nodes: new Map(),
        yaw: 0,
        pitch: 0,
        targetYaw: 0,
        targetPitch: 0,
        zoom: 0,
        width: 1,
        height: 1,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        raf: 0,
        disposed: false
      };
    } catch (error) {
      console.error(error);
      setSupported(false);
      return;
    }

    runtimeRef.current = runtime;

    const positionLocation = gl.getAttribLocation(runtime.program, "a_position");
    const uvLocation = gl.getAttribLocation(runtime.program, "a_uv");
    gl.useProgram(runtime.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.uniform1i(runtime.textureLocation, 0);

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, bounds.width < 640 ? 1.35 : 1.8);
      const width = Math.max(1, Math.round(bounds.width * dpr));
      const height = Math.max(1, Math.round(bounds.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      runtime.width = bounds.width;
      runtime.height = bounds.height;
      gl.viewport(0, 0, width, height);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;

    const pointerDown = (event: PointerEvent) => {
      dragging = true;
      moved = false;
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
    };

    const pointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height || runtime.reducedMotion) return;
      if (dragging) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        runtime.targetYaw += dx * 0.0065;
        runtime.targetPitch = Math.max(-0.48, Math.min(0.48, runtime.targetPitch + dy * 0.0048));
        lastX = event.clientX;
        lastY = event.clientY;
        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 6) moved = true;
      } else {
        const nx = (event.clientX - bounds.left) / bounds.width - 0.5;
        const ny = (event.clientY - bounds.top) / bounds.height - 0.5;
        runtime.targetYaw = nx * 0.38;
        runtime.targetPitch = ny * 0.23;
      }
    };

    const pointerUp = (event: PointerEvent) => {
      const latest = propsRef.current;
      if (!moved && latest.mode === "finalists" && latest.onSelect) {
        const bounds = canvas.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        let closest: NodeState | undefined;
        let distance = Number.POSITIVE_INFINITY;
        for (const node of runtime.nodes.values()) {
          const nextDistance = Math.hypot(node.screenX - x, node.screenY - y);
          if (nextDistance <= Math.max(38, node.screenRadius * 1.08) && nextDistance < distance) {
            closest = node;
            distance = nextDistance;
          }
        }
        if (closest) latest.onSelect(closest.id);
      }
      dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
    };

    const pointerLeave = () => {
      if (!dragging && !runtime.reducedMotion) {
        runtime.targetYaw = 0;
        runtime.targetPitch = 0;
      }
    };

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("pointerleave", pointerLeave);

    const render = (time: number) => {
      if (runtime.disposed) return;
      resize();

      const latest = propsRef.current;
      syncNodes(runtime, latest.products, latest.leavingIds, latest.mode, latest.selectedId);

      runtime.yaw = lerp(runtime.yaw, runtime.targetYaw, runtime.reducedMotion ? 1 : 0.065);
      runtime.pitch = lerp(runtime.pitch, runtime.targetPitch, runtime.reducedMotion ? 1 : 0.065);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(runtime.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, runtime.buffer);

      const aspect = Math.max(0.4, runtime.width / Math.max(1, runtime.height));
      const camera = latest.mode === "finalists" ? 12.3 : 12.8;
      const autoSpin = runtime.reducedMotion || latest.mode === "finalists" ? 0 : time * 0.000035;
      const drawYaw = runtime.yaw + autoSpin;
      const drawPitch = runtime.pitch;

      gl.uniform2f(runtime.rotationLocation, drawYaw, drawPitch);
      gl.uniform1f(runtime.aspectLocation, aspect);
      gl.uniform1f(runtime.cameraLocation, camera);

      const nodes = [...runtime.nodes.values()];
      nodes.sort((left, right) => left.z - right.z);

      for (const node of nodes) {
        const speed = node.retiring ? 0.16 : latest.mode === "finalists" ? 0.11 : 0.075;
        node.x = lerp(node.x, node.tx, speed);
        node.y = lerp(node.y, node.ty, speed);
        node.z = lerp(node.z, node.tz, speed);
        node.scale = lerp(node.scale, node.tscale, speed);
        node.opacity = lerp(node.opacity, node.topacity, node.retiring ? 0.18 : 0.09);

        const floatAmount = runtime.reducedMotion ? 0 : latest.mode === "finalists" ? 0.045 : 0.11;
        const floatY = Math.sin(time * 0.00075 + node.phase) * floatAmount;
        const floatX = Math.cos(time * 0.00048 + node.phase * 1.7) * floatAmount * 0.45;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, node.texture);
        gl.uniform3f(runtime.worldLocation, node.x + floatX, node.y + floatY, node.z);
        gl.uniform1f(runtime.sizeLocation, node.scale);
        gl.uniform1f(runtime.opacityLocation, Math.max(0, Math.min(1, node.opacity)));
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        const rotated = rotatePoint(node.x + floatX, node.y + floatY, node.z, drawYaw, drawPitch);
        const depth = Math.max(1.3, camera - rotated[2]);
        const focal = 2.42;
        const ndcX = (rotated[0] / depth) * focal / aspect;
        const ndcY = (rotated[1] / depth) * focal;
        node.screenX = (ndcX * 0.5 + 0.5) * runtime.width;
        node.screenY = (1 - (ndcY * 0.5 + 0.5)) * runtime.height;
        node.screenRadius = Math.abs((node.scale / depth) * focal) * runtime.height * 0.5;
      }

      for (const [id, node] of runtime.nodes) {
        if (node.retiring && node.opacity < 0.015 && !latest.products.some((product) => product.id === id)) {
          if (node.texture) gl.deleteTexture(node.texture);
          runtime.nodes.delete(id);
        }
      }

      runtime.raf = requestAnimationFrame(render);
    };

    runtime.raf = requestAnimationFrame(render);

    return () => {
      runtime.disposed = true;
      cancelAnimationFrame(runtime.raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("pointerleave", pointerLeave);
      for (const node of runtime.nodes.values()) {
        if (node.texture) gl.deleteTexture(node.texture);
      }
      gl.deleteBuffer(runtime.buffer);
      gl.deleteProgram(runtime.program);
      runtimeRef.current = null;
    };
  }, []);

  return (
    <div className={`${styles.wrap} ${mode === "finalists" ? styles.finalists : styles.cloud} ${className}`}>
      {supported ? (
        <>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            aria-label={ariaLabel}
            role="img"
          />
          <div className={styles.hud} aria-hidden="true">
            <span>WEBGL · LIVE 3D</span>
            <i />
          </div>
          <div className={styles.axis} aria-hidden="true"><span /><span /><span /></div>
          {mode === "finalists" ? <div className={styles.finalistHint}>σύρε για περιστροφή · πάτησε προϊόν</div> : <div className={styles.cloudHint}>σύρε το πεδίο · κάθε απάντηση αφαιρεί μη συμβατά προϊόντα</div>}
        </>
      ) : (
        <div className={styles.fallback} role="img" aria-label={ariaLabel}>
          {products.slice(0, mode === "finalists" ? 5 : 24).map((product) => (
            <span key={product.id}><img src={`/api/catalog-source-image/${encodeURIComponent(product.id)}`} alt="" />{product.brand || "SPORT"}</span>
          ))}
        </div>
      )}
    </div>
  );
}
