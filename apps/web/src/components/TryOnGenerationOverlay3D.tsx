"use client";

import { useEffect, useRef, useState } from "react";
import { TryOnGenerationOverlay } from "./TryOnGenerationOverlay";
import styles from "./TryOnGenerationOverlay3D.module.css";

type Phase = "photo" | "scan" | "compose" | "reveal";
type GL = WebGLRenderingContext | WebGL2RenderingContext;
type Mat4 = Float32Array;

type SceneController = Readonly<{
  setResultImage(value: string): void;
  destroy(): void;
}>;

type Mesh = Readonly<{
  buffer: WebGLBuffer;
  count: number;
}>;

type GarmentPart = Readonly<{
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx?: number;
  ry?: number;
  rz?: number;
}>;

type GarmentActor = Readonly<{
  parts: readonly GarmentPart[];
  phase: number;
  speed: number;
  radius: number;
  height: number;
  depth: number;
  direction: 1 | -1;
  tone: readonly [number, number, number, number];
}>;

const phaseCopy: Record<Phase, { kicker: string; title: string; detail: string }> = {
  photo: {
    kicker: "KONTA MOY · TRY ON ME",
    title: "Η φωτογραφία σου μπαίνει στο fitting space",
    detail: "Ξεκινάμε από τη δική σου εικόνα και προετοιμάζουμε το 3D περιβάλλον."
  },
  scan: {
    kicker: "3D AI FITTING SCAN",
    title: "Σαρώνουμε τη στάση και τη σιλουέτα",
    detail: "Το holographic scan χαρτογραφεί οπτικά τη φωτογραφία πριν τη σύνθεση."
  },
  compose: {
    kicker: "WEBGL VIRTUAL WARDROBE",
    title: "Τα ρούχα κινούνται γύρω σου",
    detail: "Το FASHN δημιουργεί το αποτέλεσμα ενώ το 3D wardrobe παραμένει σε κίνηση."
  },
  reveal: {
    kicker: "TRY ON COMPLETE",
    title: "Το look σου υλοποιήθηκε",
    detail: "Το τελικό FASHN αποτέλεσμα αντικαθιστά τη φωτογραφία σου."
  }
};

const shirtParts: readonly GarmentPart[] = [
  { x: 0, y: 0, z: 0, sx: 0.74, sy: 0.95, sz: 0.12 },
  { x: -0.72, y: 0.33, z: 0, sx: 0.58, sy: 0.28, sz: 0.11, rz: -0.42 },
  { x: 0.72, y: 0.33, z: 0, sx: 0.58, sy: 0.28, sz: 0.11, rz: 0.42 }
];

const dressParts: readonly GarmentPart[] = [
  { x: 0, y: 0.52, z: 0, sx: 0.58, sy: 0.62, sz: 0.11 },
  { x: 0, y: -0.45, z: 0, sx: 0.98, sy: 0.95, sz: 0.12, rz: 0.02 }
];

const jacketParts: readonly GarmentPart[] = [
  { x: 0, y: 0, z: 0, sx: 0.8, sy: 1.0, sz: 0.16 },
  { x: -0.78, y: 0.1, z: 0, sx: 0.35, sy: 0.88, sz: 0.14, rz: -0.2 },
  { x: 0.78, y: 0.1, z: 0, sx: 0.35, sy: 0.88, sz: 0.14, rz: 0.2 },
  { x: 0, y: 0.32, z: 0.14, sx: 0.08, sy: 0.68, sz: 0.04 }
];

const trouserParts: readonly GarmentPart[] = [
  { x: 0, y: 0.62, z: 0, sx: 0.8, sy: 0.28, sz: 0.12 },
  { x: -0.26, y: -0.22, z: 0, sx: 0.32, sy: 1.28, sz: 0.12, rz: 0.035 },
  { x: 0.26, y: -0.22, z: 0, sx: 0.32, sy: 1.28, sz: 0.12, rz: -0.035 }
];

const skirtParts: readonly GarmentPart[] = [
  { x: 0, y: 0.45, z: 0, sx: 0.72, sy: 0.22, sz: 0.11 },
  { x: 0, y: -0.18, z: 0, sx: 1.0, sy: 0.85, sz: 0.12 }
];

const hoodieParts: readonly GarmentPart[] = [
  { x: 0, y: -0.08, z: 0, sx: 0.82, sy: 0.9, sz: 0.15 },
  { x: -0.78, y: 0.08, z: 0, sx: 0.34, sy: 0.78, sz: 0.13, rz: -0.24 },
  { x: 0.78, y: 0.08, z: 0, sx: 0.34, sy: 0.78, sz: 0.13, rz: 0.24 },
  { x: 0, y: 0.92, z: -0.05, sx: 0.56, sy: 0.43, sz: 0.19 }
];

const actors: readonly GarmentActor[] = [
  { parts: shirtParts, phase: 0.2, speed: 0.68, radius: 3.5, height: 1.45, depth: 1.65, direction: 1, tone: [0.21, 0.96, 0.9, 0.88] },
  { parts: dressParts, phase: 1.3, speed: 0.57, radius: 4.1, height: 1.7, depth: 2.15, direction: -1, tone: [0.49, 0.46, 1, 0.84] },
  { parts: jacketParts, phase: 2.2, speed: 0.62, radius: 3.8, height: 1.25, depth: 2.45, direction: 1, tone: [0.18, 0.69, 1, 0.82] },
  { parts: trouserParts, phase: 3.25, speed: 0.52, radius: 4.35, height: 1.55, depth: 1.85, direction: -1, tone: [0.12, 0.92, 0.78, 0.8] },
  { parts: skirtParts, phase: 4.25, speed: 0.73, radius: 3.65, height: 1.8, depth: 2.2, direction: 1, tone: [0.63, 0.4, 1, 0.78] },
  { parts: hoodieParts, phase: 5.1, speed: 0.6, radius: 4.05, height: 1.35, depth: 2.55, direction: -1, tone: [0.2, 0.78, 1, 0.84] }
];

function identity(): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4]
        + a[4 + row] * b[column * 4 + 1]
        + a[8 + row] * b[column * 4 + 2]
        + a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function perspective(fovRadians: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovRadians / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * range, -1,
    0, 0, near * far * 2 * range, 0
  ]);
}

function translation(x: number, y: number, z: number): Mat4 {
  const out = identity();
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
}

function scaling(x: number, y: number, z: number): Mat4 {
  const out = identity();
  out[0] = x;
  out[5] = y;
  out[10] = z;
  return out;
}

function rotationX(value: number): Mat4 {
  const c = Math.cos(value);
  const s = Math.sin(value);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

function rotationY(value: number): Mat4 {
  const c = Math.cos(value);
  const s = Math.sin(value);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function rotationZ(value: number): Mat4 {
  const c = Math.cos(value);
  const s = Math.sin(value);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function trs(x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): Mat4 {
  return multiply(
    translation(x, y, z),
    multiply(rotationZ(rz), multiply(rotationY(ry), multiply(rotationX(rx), scaling(sx, sy, sz))))
  );
}

function compile(gl: GL, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WEBGL_SHADER_CREATE_FAILED");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "WEBGL_SHADER_COMPILE_FAILED";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function program(gl: GL, vertexSource: string, fragmentSource: string): WebGLProgram {
  const result = gl.createProgram();
  if (!result) throw new Error("WEBGL_PROGRAM_CREATE_FAILED");
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(result, vertex);
  gl.attachShader(result, fragment);
  gl.linkProgram(result);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(result) || "WEBGL_PROGRAM_LINK_FAILED";
    gl.deleteProgram(result);
    throw new Error(message);
  }
  return result;
}

function cubeMesh(gl: GL): Mesh {
  const p = [
    -1,-1, 1,  1,-1, 1,  1, 1, 1, -1,-1, 1,  1, 1, 1, -1, 1, 1,
     1,-1,-1, -1,-1,-1, -1, 1,-1,  1,-1,-1, -1, 1,-1,  1, 1,-1,
    -1,-1,-1, -1,-1, 1, -1, 1, 1, -1,-1,-1, -1, 1, 1, -1, 1,-1,
     1,-1, 1,  1,-1,-1,  1, 1,-1,  1,-1, 1,  1, 1,-1,  1, 1, 1,
    -1, 1, 1,  1, 1, 1,  1, 1,-1, -1, 1, 1,  1, 1,-1, -1, 1,-1,
    -1,-1,-1,  1,-1,-1,  1,-1, 1, -1,-1,-1,  1,-1, 1, -1,-1, 1
  ];
  const n = [
     0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1,
     0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,
    -1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,
     1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,
     0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,
     0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0
  ];
  const interleaved = new Float32Array(36 * 6);
  for (let index = 0; index < 36; index += 1) {
    interleaved[index * 6] = p[index * 3];
    interleaved[index * 6 + 1] = p[index * 3 + 1];
    interleaved[index * 6 + 2] = p[index * 3 + 2];
    interleaved[index * 6 + 3] = n[index * 3];
    interleaved[index * 6 + 4] = n[index * 3 + 1];
    interleaved[index * 6 + 5] = n[index * 3 + 2];
  }
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("WEBGL_BUFFER_CREATE_FAILED");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
  return { buffer, count: 36 };
}

function quadBuffer(gl: GL): WebGLBuffer {
  const data = new Float32Array([
    -1,-1,0,0, 1,-1,1,0, 1,1,1,1,
    -1,-1,0,0, 1,1,1,1, -1,1,0,1
  ]);
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("WEBGL_BUFFER_CREATE_FAILED");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

function textureFromImage(
  gl: GL,
  src: string,
  onReady: (texture: WebGLTexture, aspect: number) => void
): () => void {
  let cancelled = false;
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    if (cancelled) return;
    const texture = gl.createTexture();
    if (!texture) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    onReady(texture, Math.max(0.2, image.naturalWidth / Math.max(1, image.naturalHeight)));
  };
  image.src = src;
  return () => { cancelled = true; image.onload = null; };
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function lowMotionDevice(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  return typeof navigatorWithMemory.deviceMemory === "number" && navigatorWithMemory.deviceMemory <= 2;
}

function buildScene(canvas: HTMLCanvasElement, modelImage: string, onContextLost: () => void): SceneController {
  const gl = (canvas.getContext("webgl", { alpha: true, antialias: true, powerPreference: "high-performance" })
    || canvas.getContext("webgl2", { alpha: true, antialias: true, powerPreference: "high-performance" })) as GL | null;
  if (!gl) throw new Error("WEBGL_UNAVAILABLE");

  const texturedProgram = program(gl, `
    attribute vec2 a_position;
    attribute vec2 a_uv;
    uniform mat4 u_projection;
    uniform vec3 u_center;
    uniform vec2 u_scale;
    varying vec2 v_uv;
    void main() {
      vec3 world = vec3(a_position * u_scale + u_center.xy, u_center.z);
      gl_Position = u_projection * vec4(world, 1.0);
      v_uv = a_uv;
    }
  `, `
    precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_alpha;
    uniform float u_brightness;
    void main() {
      vec4 texel = texture2D(u_texture, v_uv);
      gl_FragColor = vec4(texel.rgb * u_brightness, texel.a * u_alpha);
    }
  `);

  const meshProgram = program(gl, `
    attribute vec3 a_position;
    attribute vec3 a_normal;
    uniform mat4 u_projection;
    uniform mat4 u_model;
    varying vec3 v_normal;
    varying float v_depth;
    void main() {
      vec4 world = u_model * vec4(a_position, 1.0);
      gl_Position = u_projection * world;
      v_normal = mat3(u_model) * a_normal;
      v_depth = clamp((-world.z - 2.0) / 9.0, 0.0, 1.0);
    }
  `, `
    precision mediump float;
    varying vec3 v_normal;
    varying float v_depth;
    uniform vec4 u_color;
    uniform float u_glow;
    void main() {
      vec3 normal = normalize(v_normal);
      vec3 lightDirection = normalize(vec3(-0.35, 0.65, 0.72));
      float diffuse = max(dot(normal, lightDirection), 0.0);
      float rim = pow(1.0 - abs(normal.z), 2.2);
      vec3 base = u_color.rgb * (0.34 + diffuse * 0.58);
      base += vec3(0.25, 1.0, 0.94) * rim * u_glow;
      base += u_color.rgb * (1.0 - v_depth) * 0.12;
      gl_FragColor = vec4(base, u_color.a);
    }
  `);

  const pointProgram = program(gl, `
    attribute vec3 a_position;
    uniform mat4 u_projection;
    uniform float u_time;
    varying float v_alpha;
    void main() {
      vec3 point = a_position;
      point.x += sin(u_time * 0.55 + a_position.y * 1.7) * 0.12;
      point.y += cos(u_time * 0.42 + a_position.x * 1.2) * 0.11;
      gl_Position = u_projection * vec4(point, 1.0);
      gl_PointSize = clamp(12.0 / max(1.0, -point.z), 1.4, 4.2);
      v_alpha = 0.28 + 0.5 * (1.0 - clamp((-point.z - 3.0) / 7.0, 0.0, 1.0));
    }
  `, `
    precision mediump float;
    varying float v_alpha;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float d = length(p);
      if (d > 0.5) discard;
      float glow = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(0.48, 1.0, 0.94, glow * v_alpha);
    }
  `);

  const quad = quadBuffer(gl);
  const cube = cubeMesh(gl);

  const particleCount = 260;
  const particleData = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
    const ring = 2.7 + (index % 19) * 0.12;
    const angle = index * 2.399963;
    particleData[index * 3] = Math.cos(angle) * ring;
    particleData[index * 3 + 1] = Math.sin(angle) * (1.5 + (index % 7) * 0.13);
    particleData[index * 3 + 2] = -4.1 - (index % 11) * 0.43;
  }
  const particleBuffer = gl.createBuffer();
  if (!particleBuffer) throw new Error("WEBGL_BUFFER_CREATE_FAILED");
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.STATIC_DRAW);

  let modelTexture: WebGLTexture | undefined;
  let resultTexture: WebGLTexture | undefined;
  let modelAspect = 0.78;
  let resultAspect = 0.78;
  let resultCancel: (() => void) | undefined;
  let revealStartedAt = 0;
  let projection = perspective(Math.PI / 4.8, 1, 0.1, 30);
  let frame = 0;
  let stopped = false;
  let visible = !document.hidden;

  const cancelModelLoad = textureFromImage(gl, modelImage, (texture, aspect) => {
    if (modelTexture) gl.deleteTexture(modelTexture);
    modelTexture = texture;
    modelAspect = aspect;
  });

  const onLost = (event: Event) => {
    event.preventDefault();
    onContextLost();
  };
  canvas.addEventListener("webglcontextlost", onLost, false);

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.65);
    const nextWidth = Math.max(1, Math.floor(width * ratio));
    const nextHeight = Math.max(1, Math.floor(height * ratio));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      gl.viewport(0, 0, nextWidth, nextHeight);
    }
    projection = perspective(Math.PI / 4.8, width / height, 0.1, 30);
  };

  const texturedPosition = gl.getAttribLocation(texturedProgram, "a_position");
  const texturedUv = gl.getAttribLocation(texturedProgram, "a_uv");
  const texturedProjection = gl.getUniformLocation(texturedProgram, "u_projection");
  const texturedCenter = gl.getUniformLocation(texturedProgram, "u_center");
  const texturedScale = gl.getUniformLocation(texturedProgram, "u_scale");
  const texturedTexture = gl.getUniformLocation(texturedProgram, "u_texture");
  const texturedAlpha = gl.getUniformLocation(texturedProgram, "u_alpha");
  const texturedBrightness = gl.getUniformLocation(texturedProgram, "u_brightness");

  const meshPosition = gl.getAttribLocation(meshProgram, "a_position");
  const meshNormal = gl.getAttribLocation(meshProgram, "a_normal");
  const meshProjection = gl.getUniformLocation(meshProgram, "u_projection");
  const meshModel = gl.getUniformLocation(meshProgram, "u_model");
  const meshColor = gl.getUniformLocation(meshProgram, "u_color");
  const meshGlow = gl.getUniformLocation(meshProgram, "u_glow");

  const pointPosition = gl.getAttribLocation(pointProgram, "a_position");
  const pointProjection = gl.getUniformLocation(pointProgram, "u_projection");
  const pointTime = gl.getUniformLocation(pointProgram, "u_time");

  function drawPhoto(
    texture: WebGLTexture | undefined,
    alpha: number,
    brightness: number,
    z: number,
    aspect: number
  ) {
    if (!texture || alpha <= 0.001) return;
    const maxHalfWidth = 1.62;
    const maxHalfHeight = 2.03;
    let halfHeight = maxHalfHeight;
    let halfWidth = maxHalfHeight * aspect;
    if (halfWidth > maxHalfWidth) {
      halfWidth = maxHalfWidth;
      halfHeight = maxHalfWidth / Math.max(0.2, aspect);
    }
    gl.useProgram(texturedProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(texturedPosition);
    gl.vertexAttribPointer(texturedPosition, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texturedUv);
    gl.vertexAttribPointer(texturedUv, 2, gl.FLOAT, false, 16, 8);
    gl.uniformMatrix4fv(texturedProjection, false, projection);
    gl.uniform3f(texturedCenter, 0, 0, z);
    gl.uniform2f(texturedScale, halfWidth, halfHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(texturedTexture, 0);
    gl.uniform1f(texturedAlpha, alpha);
    gl.uniform1f(texturedBrightness, brightness);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawCube(model: Mat4, tone: readonly [number, number, number, number], glow: number) {
    gl.useProgram(meshProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, cube.buffer);
    gl.enableVertexAttribArray(meshPosition);
    gl.vertexAttribPointer(meshPosition, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(meshNormal);
    gl.vertexAttribPointer(meshNormal, 3, gl.FLOAT, false, 24, 12);
    gl.uniformMatrix4fv(meshProjection, false, projection);
    gl.uniformMatrix4fv(meshModel, false, model);
    gl.uniform4f(meshColor, tone[0], tone[1], tone[2], tone[3]);
    gl.uniform1f(meshGlow, glow);
    gl.drawArrays(gl.TRIANGLES, 0, cube.count);
  }

  function drawGarments(time: number) {
    actors.forEach((actor, actorIndex) => {
      const theta = time * actor.speed * actor.direction + actor.phase;
      const x = Math.cos(theta) * actor.radius;
      const y = Math.sin(theta * 0.73) * actor.height;
      const z = -6.1 + Math.sin(theta * 1.17) * actor.depth;
      const actorScale = 0.34 + (1 - Math.min(1, Math.max(0, (-z - 3.5) / 5.2))) * 0.18;
      const actorMatrix = trs(
        x,
        y,
        z,
        Math.sin(theta * 1.3) * 0.16,
        theta + Math.PI * 0.5,
        Math.sin(theta * 0.82 + actorIndex) * 0.23,
        actorScale,
        actorScale,
        actorScale
      );

      actor.parts.forEach((part, partIndex) => {
        const flutter = Math.sin(time * (2.5 + actorIndex * 0.12) + partIndex * 0.9) * 0.035;
        const local = trs(
          part.x,
          part.y,
          part.z + flutter,
          (part.rx ?? 0) + flutter * 0.45,
          (part.ry ?? 0) + flutter * 0.6,
          (part.rz ?? 0) + flutter,
          part.sx,
          part.sy,
          part.sz
        );
        drawCube(multiply(actorMatrix, local), actor.tone, 1.0);
      });
    });
  }

  function drawScanner(time: number) {
    const scanY = -1.95 + ((time * 0.68) % 1) * 3.9;
    const scan = trs(0, scanY, -5.78, 0, 0, 0, 1.7, 0.025, 0.04);
    drawCube(scan, [0.45, 1, 0.94, 0.7], 1.6);

    for (let index = -4; index <= 4; index += 1) {
      const horizontal = trs(0, index * 0.45, -5.9, 0, 0, 0, 1.62, 0.004, 0.015);
      drawCube(horizontal, [0.28, 0.88, 0.83, 0.11], 0.2);
    }
    for (let index = -3; index <= 3; index += 1) {
      const vertical = trs(index * 0.48, 0, -5.9, 0, 0, 0, 0.004, 2.0, 0.015);
      drawCube(vertical, [0.28, 0.88, 0.83, 0.09], 0.2);
    }
  }

  function drawParticles(time: number) {
    gl.useProgram(pointProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.enableVertexAttribArray(pointPosition);
    gl.vertexAttribPointer(pointPosition, 3, gl.FLOAT, false, 12, 0);
    gl.uniformMatrix4fv(pointProjection, false, projection);
    gl.uniform1f(pointTime, time);
    gl.drawArrays(gl.POINTS, 0, particleCount);
  }

  function render(timestamp: number) {
    if (stopped) return;
    resize();
    if (!visible) {
      frame = window.requestAnimationFrame(render);
      return;
    }

    const time = timestamp / 1000;
    gl.clearColor(0.018, 0.033, 0.055, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    drawParticles(time);
    drawGarments(time);
    drawPhoto(modelTexture, resultTexture ? 0.42 : 1, resultTexture ? 0.62 : 0.94, -6.0, modelAspect);
    drawScanner(time);

    if (resultTexture) {
      const elapsed = revealStartedAt ? Math.max(0, (timestamp - revealStartedAt) / 1000) : 1;
      const reveal = Math.min(1, elapsed / 0.72);
      drawPhoto(resultTexture, reveal, 0.92 + reveal * 0.08, -5.92, resultAspect);
    }

    frame = window.requestAnimationFrame(render);
  }

  const visibility = () => { visible = !document.hidden; };
  document.addEventListener("visibilitychange", visibility);
  frame = window.requestAnimationFrame(render);

  return {
    setResultImage(value: string) {
      resultCancel?.();
      resultCancel = textureFromImage(gl, value, (texture, aspect) => {
        if (resultTexture) gl.deleteTexture(resultTexture);
        resultTexture = texture;
        resultAspect = aspect;
        revealStartedAt = performance.now();
      });
    },
    destroy() {
      stopped = true;
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", onLost, false);
      cancelModelLoad();
      resultCancel?.();
      if (modelTexture) gl.deleteTexture(modelTexture);
      if (resultTexture) gl.deleteTexture(resultTexture);
      gl.deleteBuffer(quad);
      gl.deleteBuffer(cube.buffer);
      gl.deleteBuffer(particleBuffer);
      gl.deleteProgram(texturedProgram);
      gl.deleteProgram(meshProgram);
      gl.deleteProgram(pointProgram);
    }
  };
}

export function TryOnGenerationOverlay3D({
  modelImage,
  resultImage,
  productTitle
}: {
  modelImage: string;
  resultImage?: string;
  productTitle: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneController | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("photo");
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (lowMotionDevice() || !supportsWebGL()) {
      setFallback(true);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setFallback(true);
      return;
    }

    try {
      const scene = buildScene(canvas, modelImage, () => setFallback(true));
      sceneRef.current = scene;
      if (resultImage) scene.setResultImage(resultImage);
      return () => {
        scene.destroy();
        if (sceneRef.current === scene) sceneRef.current = undefined;
      };
    } catch {
      setFallback(true);
      return;
    }
  }, [modelImage]);

  useEffect(() => {
    if (resultImage) {
      setPhase("reveal");
      sceneRef.current?.setResultImage(resultImage);
      return;
    }
    setPhase("photo");
    const scanTimer = window.setTimeout(() => setPhase("scan"), 650);
    const composeTimer = window.setTimeout(() => setPhase("compose"), 1750);
    return () => {
      window.clearTimeout(scanTimer);
      window.clearTimeout(composeTimer);
    };
  }, [resultImage]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  if (fallback) {
    return <TryOnGenerationOverlay modelImage={modelImage} resultImage={resultImage} productTitle={productTitle} />;
  }

  const copy = phaseCopy[phase];

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="3D Try On δημιουργία">
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.interface}>
        <div className={styles.copy} aria-live="polite">
          <span className={styles.kicker}>{copy.kicker}</span>
          <h2>{copy.title}</h2>
          <p>{copy.detail}</p>
        </div>

        <div className={styles.reticle} aria-hidden="true">
          <span className={styles.cornerA} />
          <span className={styles.cornerB} />
          <span className={styles.cornerC} />
          <span className={styles.cornerD} />
        </div>

        <div className={styles.footer}>
          <span className={styles.live}><i /> LIVE 3D</span>
          <div className={styles.progress} aria-hidden="true">
            <span className={phase === "photo" ? styles.active : ""} />
            <span className={phase === "scan" ? styles.active : ""} />
            <span className={phase === "compose" ? styles.active : ""} />
            <span className={phase === "reveal" ? styles.active : ""} />
          </div>
          <span>{phase === "reveal" ? "Το αποτέλεσμα είναι έτοιμο" : "WebGL fitting space · FASHN generation in progress"}</span>
        </div>
      </div>
    </div>
  );
}
