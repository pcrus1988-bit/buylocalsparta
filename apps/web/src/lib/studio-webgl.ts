import type { StudioQualityTier } from "../components/StudioExperienceRuntime";

export function createStudioProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label: string
): WebGLProgram {
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error(`${label}_shader_create_failed`);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || `${label}_shader_compile_failed`;
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  };

  const program = gl.createProgram();
  if (!program) throw new Error(`${label}_program_create_failed`);

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || `${label}_program_link_failed`;
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

export function studioDprCap(
  qualityTier: StudioQualityTier,
  caps: Readonly<{ high?: number; balanced?: number; lite?: number }> = {}
): number {
  if (qualityTier === "high") return caps.high ?? 1.6;
  if (qualityTier === "balanced") return caps.balanced ?? 1.35;
  return caps.lite ?? 1;
}

export function resizeStudioCanvas(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  gl: WebGLRenderingContext,
  dprCap: number
): number {
  const rect = host.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  gl.viewport(0, 0, canvas.width, canvas.height);
  return dpr;
}

export function hexToStudioRgb(hex: string, fallback: readonly [number, number, number] = [0.8, 0.7, 0.48]): [number, number, number] {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return [fallback[0], fallback[1], fallback[2]];
  return [
    parseInt(match[1], 16) / 255,
    parseInt(match[2], 16) / 255,
    parseInt(match[3], 16) / 255
  ];
}
