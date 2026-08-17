export type HealthState = "healthy" | "degraded" | "unhealthy";

export type HealthCheckResult = Readonly<{
  name: string;
  critical: boolean;
  state: HealthState;
  message?: string;
  latencyMs: number;
}>;

export type HealthReport = Readonly<{
  ok: boolean;
  state: HealthState;
  checkedAt: number;
  checks: readonly HealthCheckResult[];
}>;

type RegisteredCheck = Readonly<{
  name: string;
  critical: boolean;
  timeoutMs: number;
  check: () => void | { state?: HealthState; message?: string } | Promise<void | { state?: HealthState; message?: string }>;
}>;

export class OperationalHealthService {
  readonly #checks: RegisteredCheck[] = [];

  register(input: {
    name: string;
    critical?: boolean;
    timeoutMs?: number;
    check: RegisteredCheck["check"];
  }): void {
    if (!input.name.trim()) throw new Error("Health-check name is required");
    if (this.#checks.some((item) => item.name === input.name)) throw new Error(`Health check already registered: ${input.name}`);
    const timeoutMs = input.timeoutMs ?? 1_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Health-check timeout must be positive");
    this.#checks.push({ name: input.name, critical: input.critical ?? true, timeoutMs, check: input.check });
  }

  async readiness(now = Date.now()): Promise<HealthReport> {
    const checks: HealthCheckResult[] = [];
    for (const registered of this.#checks) checks.push(await runCheck(registered));
    const criticalFailure = checks.some((item) => item.critical && item.state === "unhealthy");
    const anyProblem = checks.some((item) => item.state !== "healthy");
    return {
      ok: !criticalFailure,
      state: criticalFailure ? "unhealthy" : anyProblem ? "degraded" : "healthy",
      checkedAt: now,
      checks
    };
  }

  liveness(now = Date.now()): HealthReport {
    return {
      ok: true,
      state: "healthy",
      checkedAt: now,
      checks: [{ name: "process", critical: true, state: "healthy", latencyMs: 0 }]
    };
  }
}

async function runCheck(registered: RegisteredCheck): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => registered.check()),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Health check timed out after ${registered.timeoutMs}ms`)), registered.timeoutMs);
      })
    ]);
    const resolved = result as { state?: HealthState; message?: string } | undefined;
    const state = resolved?.state ?? "healthy";
    return { name: registered.name, critical: registered.critical, state, message: resolved?.message, latencyMs: Math.max(0, Date.now() - startedAt) };
  } catch (error) {
    return {
      name: registered.name,
      critical: registered.critical,
      state: "unhealthy",
      message: error instanceof Error ? error.message : "Health check failed",
      latencyMs: Math.max(0, Date.now() - startedAt)
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
