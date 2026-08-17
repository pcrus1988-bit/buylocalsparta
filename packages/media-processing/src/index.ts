import net from "node:net";

export type MalwareScanResult = Readonly<{ status: "clean" | "infected"; signature?: string; raw: string }>;
export type ClamAvConfig = Readonly<{ host: string; port: number; timeoutMs: number; maxBytes: number }>;

export class ClamAvScanner {
  readonly #config: ClamAvConfig;
  constructor(config: ClamAvConfig) { this.#config = config; }

  async ping(): Promise<boolean> {
    const reply = await this.#exchange((socket) => { socket.write(Buffer.from("zPING\0", "utf8")); });
    return reply.replace(/\0/g, "").trim() === "PONG";
  }

  async scan(stream: AsyncIterable<Uint8Array>): Promise<MalwareScanResult> {
    let total = 0;
    const reply = await this.#exchange(async (socket) => {
      socket.write(Buffer.from("zINSTREAM\0", "utf8"));
      for await (const raw of stream) {
        const chunk = Buffer.from(raw);
        total += chunk.length;
        if (total > this.#config.maxBytes) throw new Error(`Media exceeds malware scanner maximum of ${this.#config.maxBytes} bytes`);
        const header = Buffer.allocUnsafe(4); header.writeUInt32BE(chunk.length, 0);
        if (!socket.write(header)) await onceDrain(socket);
        if (!socket.write(chunk)) await onceDrain(socket);
      }
      socket.write(Buffer.alloc(4));
    });
    const normalized = reply.replace(/\0/g, "").trim();
    if (/\bOK$/.test(normalized)) return { status: "clean", raw: normalized };
    const infected = normalized.match(/:\s*(.+)\s+FOUND$/);
    if (infected) return { status: "infected", signature: infected[1]?.trim(), raw: normalized };
    throw new Error(`ClamAV scan failed: ${normalized || "empty response"}`);
  }

  #exchange(write: (socket: net.Socket) => Promise<void> | void): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.#config.host, port: this.#config.port });
      const chunks: Buffer[] = [];
      const timeout = setTimeout(() => socket.destroy(new Error("ClamAV request timed out")), this.#config.timeoutMs);
      socket.on("connect", () => { Promise.resolve(write(socket)).catch((error) => socket.destroy(error instanceof Error ? error : new Error(String(error)))); });
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      socket.on("error", (error) => { clearTimeout(timeout); reject(error); });
      socket.on("close", (hadError) => { clearTimeout(timeout); if (!hadError) resolve(Buffer.concat(chunks).toString("utf8")); });
    });
  }
}

export function clamAvConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ClamAvConfig {
  const host = env.BLS_CLAMAV_HOST?.trim();
  if (!host) throw new Error("BLS_CLAMAV_HOST is required");
  return { host, port: positiveInt(env.BLS_CLAMAV_PORT, 3310, "BLS_CLAMAV_PORT"), timeoutMs: positiveInt(env.BLS_CLAMAV_TIMEOUT_MS, 60_000, "BLS_CLAMAV_TIMEOUT_MS"), maxBytes: positiveInt(env.BLS_MEDIA_MAX_BYTES, 25 * 1024 * 1024, "BLS_MEDIA_MAX_BYTES") };
}

function positiveInt(raw: string | undefined, fallback: number, name: string): number { if (!raw?.trim()) return fallback; const value=Number(raw); if(!Number.isSafeInteger(value)||value<=0) throw new Error(`${name} must be a positive integer`); return value; }
function onceDrain(socket: net.Socket): Promise<void> { return new Promise((resolve,reject)=>{const done=()=>{socket.off("error",fail);resolve()};const fail=(e:Error)=>{socket.off("drain",done);reject(e)};socket.once("drain",done);socket.once("error",fail)}); }
