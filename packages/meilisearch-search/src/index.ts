import { buildSearchAliases, interpretSearchQuery, normalizeSearchText, type SearchDocument, type SearchHit, type SearchIndexBackend, type SearchQuery } from "@buy-local-sparta/core";

export type MeilisearchConfig = Readonly<{
  host: string;
  indexUid: string;
  adminApiKey?: string;
  searchApiKey: string;
  timeoutMs: number;
  taskTimeoutMs: number;
  taskPollMs: number;
}>;

type TaskSummary = { taskUid: number; status: string };
type TaskDetail = { uid: number; status: "enqueued"|"processing"|"succeeded"|"failed"|"canceled"; error?: unknown };
type SearchResponse = { hits?: unknown[]; estimatedTotalHits?: number; processingTimeMs?: number };

export class MeilisearchClient implements SearchIndexBackend {
  readonly #config: MeilisearchConfig;
  readonly #fetch: typeof fetch;
  constructor(config: MeilisearchConfig, fetchImpl: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchImpl;
  }

  async health(): Promise<{ ok: boolean; status?: string }> {
    const response = await this.#request("/health", { method: "GET", auth: false, accept: [200] });
    const body = await response.json().catch(() => ({})) as { status?: string };
    return { ok: response.ok && body.status === "available", status: body.status };
  }

  async configureIndex(): Promise<void> {
    const adminApiKey = this.#adminKey();
    const get = await this.#raw(`/indexes/${encodeURIComponent(this.#config.indexUid)}`, { method: "GET", key: adminApiKey });
    if (get.status === 404) {
      const created = await this.#request("/indexes", {
        method: "POST", key: adminApiKey, body: { uid: this.#config.indexUid, primaryKey: "id" }, accept: [202]
      });
      await this.#awaitTask(await taskUid(created));
    } else if (!get.ok) {
      throw await apiError("Meilisearch index lookup failed", get);
    }

    const settings = await this.#request(`/indexes/${encodeURIComponent(this.#config.indexUid)}/settings`, {
      method: "PATCH", key: adminApiKey, accept: [202], body: {
        displayedAttributes: ["id","type","marketId","title","titleEl","titleEn","body","brand","model","identifiers","categoryCodes","synonyms","available","pickupToday","adviceAvailable","priceMinor","vendorId","attributes","metadata","attributePairs"],
        searchableAttributes: ["identifiers","model","brand","searchAliases","titleEl","titleEn","title","synonyms","body"],
        filterableAttributes: ["marketId","type","available","pickupToday","adviceAvailable","categoryCodes","attributePairs"],
        sortableAttributes: ["priceMinor"],
        localizedAttributes: [
          { locales: ["ell"], attributePatterns: ["titleEl"] },
          { locales: ["eng"], attributePatterns: ["titleEn"] }
        ],
        typoTolerance: { enabled: true, disableOnNumbers: true },
        pagination: { maxTotalHits: 1000 }
      }
    });
    await this.#awaitTask(await taskUid(settings));
  }

  async upsert(document: SearchDocument): Promise<void> {
    const response = await this.#request(`/indexes/${encodeURIComponent(this.#config.indexUid)}/documents?primaryKey=id`, {
      method: "POST", key: this.#adminKey(), accept: [202], body: [toIndexedDocument(document)]
    });
    await this.#awaitTask(await taskUid(response));
  }

  async remove(id: string): Promise<void> {
    const response = await this.#request(`/indexes/${encodeURIComponent(this.#config.indexUid)}/documents/${encodeURIComponent(id)}`, {
      method: "DELETE", key: this.#adminKey(), accept: [202]
    });
    await this.#awaitTask(await taskUid(response));
  }

  async search(query: SearchQuery & { sort?: "price-asc"|"price-desc" }): Promise<readonly SearchHit[]> {
    const intent = interpretSearchQuery(query.q);
    const filters: string[] = [`marketId = ${quote(query.marketId)}`];
    if (query.type && query.type !== "all") filters.push(`type = ${quote(query.type)}`);
    const availability = query.availability && query.availability !== "any" ? query.availability : intent.availability;
    if (availability === "in_stock") filters.push("available = true");
    if (availability === "pickup_today") filters.push("pickupToday = true");
    if (query.adviceOnly) filters.push("adviceAvailable = true");
    const minPriceMinor = query.minPriceMinor ?? intent.minPriceMinor;
    const maxPriceMinor = query.maxPriceMinor ?? intent.maxPriceMinor;
    if (minPriceMinor !== undefined) filters.push(`priceMinor >= ${integer(minPriceMinor, "minPriceMinor")}`);
    if (maxPriceMinor !== undefined) filters.push(`priceMinor <= ${integer(maxPriceMinor, "maxPriceMinor")}`);
    if (query.categoryCode) filters.push(`categoryCodes = ${quote(query.categoryCode)}`);
    for (const [code, expected] of Object.entries(query.attributeFilters ?? {})) {
      const values = Array.isArray(expected) ? expected : [expected];
      const clauses = values.map((value) => `attributePairs = ${quote(`${code}:${String(value)}`)}`);
      filters.push(clauses.length === 1 ? clauses[0] : `(${clauses.join(" OR ")})`);
    }
    const body: Record<string, unknown> = {
      q: intent.normalizedText || normalizeSearchText(query.q),
      limit: Math.min(100, Math.max(1, query.limit ?? 24)),
      filter: filters.join(" AND ")
    };
    if (query.sort === "price-asc") body.sort = ["priceMinor:asc"];
    if (query.sort === "price-desc") body.sort = ["priceMinor:desc"];
    const response = await this.#request(`/indexes/${encodeURIComponent(this.#config.indexUid)}/search`, {
      method: "POST", key: this.#config.searchApiKey, accept: [200], body
    });
    const payload = await response.json() as SearchResponse;
    const hits = Array.isArray(payload.hits) ? payload.hits : [];
    return hits.flatMap((raw, index) => {
      const document = fromIndexedDocument(raw);
      return document ? [{ document, score: Math.max(0.0001, 1 / (index + 1)), reasons: ["meilisearch", ...intent.applied.map((reason) => `intent:${reason}`)] }] : [];
    });
  }

  async autocomplete(input: { marketId: string; q: string; limit?: number }): Promise<readonly string[]> {
    if (!input.q.trim()) return [];
    const hits = await this.search({ marketId: input.marketId, q: input.q, limit: Math.min(20, Math.max(1, input.limit ?? 8)) });
    return [...new Set(hits.map((hit) => hit.document.title))].slice(0, input.limit ?? 8);
  }

  async #awaitTask(uid: number): Promise<void> {
    const deadline = Date.now() + this.#config.taskTimeoutMs;
    for (;;) {
      const response = await this.#request(`/tasks/${uid}`, { method: "GET", key: this.#adminKey(), accept: [200] });
      const task = await response.json() as TaskDetail;
      if (task.status === "succeeded") return;
      if (task.status === "failed" || task.status === "canceled") throw new Error(`Meilisearch task ${uid} ${task.status}: ${JSON.stringify(task.error ?? {})}`);
      if (Date.now() >= deadline) throw new Error(`Meilisearch task ${uid} did not finish within ${this.#config.taskTimeoutMs}ms`);
      await delay(this.#config.taskPollMs);
    }
  }

  #adminKey(): string { const key=this.#config.adminApiKey?.trim(); if(!key) throw new Error("MEILISEARCH_ADMIN_KEY is required for index-management operations"); return key; }

  async #request(path: string, input: { method: string; body?: unknown; key?: string; auth?: boolean; accept: number[] }): Promise<Response> {
    const response = await this.#raw(path, { method: input.method, body: input.body, key: input.auth === false ? undefined : (input.key ?? this.#config.searchApiKey) });
    if (!input.accept.includes(response.status)) throw await apiError(`Meilisearch ${input.method} ${path} failed`, response);
    return response;
  }

  async #raw(path: string, input: { method: string; body?: unknown; key?: string }): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#config.timeoutMs);
    try {
      const headers: Record<string,string> = { accept: "application/json" };
      if (input.key) headers.authorization = `Bearer ${input.key}`;
      if (input.body !== undefined) headers["content-type"] = "application/json";
      return await this.#fetch(`${this.#config.host.replace(/\/$/, "")}${path}`, {
        method: input.method,
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: controller.signal
      });
    } finally { clearTimeout(timer); }
  }
}

export function meilisearchConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MeilisearchConfig {
  const host = required(env.MEILISEARCH_URL, "MEILISEARCH_URL");
  const searchApiKey = required(env.MEILISEARCH_SEARCH_KEY, "MEILISEARCH_SEARCH_KEY");
  return {
    host,
    adminApiKey: env.MEILISEARCH_ADMIN_KEY?.trim() || undefined,
    searchApiKey,
    indexUid: env.MEILISEARCH_INDEX_UID?.trim() || "bls_products_v1",
    timeoutMs: positive(env.MEILISEARCH_TIMEOUT_MS, 5_000, "MEILISEARCH_TIMEOUT_MS"),
    taskTimeoutMs: positive(env.MEILISEARCH_TASK_TIMEOUT_MS, 20_000, "MEILISEARCH_TASK_TIMEOUT_MS"),
    taskPollMs: positive(env.MEILISEARCH_TASK_POLL_MS, 100, "MEILISEARCH_TASK_POLL_MS")
  };
}

function toIndexedDocument(document: SearchDocument): Record<string, unknown> {
  const aliases = buildSearchAliases([
    document.title, document.titleEl, document.titleEn, document.brand, document.model, document.body,
    ...(document.identifiers ?? []), ...(document.synonyms ?? [])
  ]);
  return { ...document, attributes: document.attributes ?? {}, metadata: document.metadata ?? {}, searchAliases: aliases, attributePairs: Object.entries(document.attributes ?? {}).flatMap(([code,value]) => String(value).split("|").map((item) => `${code}:${item}`)) };
}
function fromIndexedDocument(raw: unknown): SearchDocument | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.type !== "string" || typeof r.marketId !== "string" || typeof r.title !== "string") return undefined;
  if (!(["product","vendor","category","advice"] as const).includes(r.type as never)) return undefined;
  return {
    id:r.id,type:r.type as SearchDocument["type"],marketId:r.marketId,title:r.title,
    titleEl:optionalString(r.titleEl),titleEn:optionalString(r.titleEn),body:optionalString(r.body),brand:optionalString(r.brand),model:optionalString(r.model),
    identifiers:stringArray(r.identifiers),categoryCodes:stringArray(r.categoryCodes),synonyms:stringArray(r.synonyms),available:optionalBoolean(r.available),pickupToday:optionalBoolean(r.pickupToday),adviceAvailable:optionalBoolean(r.adviceAvailable),priceMinor:optionalInteger(r.priceMinor),vendorId:optionalString(r.vendorId),
    attributes: stringRecord(r.attributes), metadata: objectRecord(r.metadata)
  };
}
function quote(value: string): string { return `"${value.replaceAll("\\","\\\\").replaceAll('"','\\"')}"`; }
function integer(value: number,label:string): number { if(!Number.isSafeInteger(value))throw new Error(`${label} must be a safe integer`);return value; }
function required(value:string|undefined,name:string){const v=value?.trim();if(!v)throw new Error(`${name} is required`);return v;}
function positive(raw:string|undefined,fallback:number,name:string){if(!raw?.trim())return fallback;const n=Number(raw);if(!Number.isSafeInteger(n)||n<=0)throw new Error(`${name} must be a positive integer`);return n;}
function optionalString(v:unknown){return typeof v==="string"?v:undefined;} function optionalBoolean(v:unknown){return typeof v==="boolean"?v:undefined;} function optionalInteger(v:unknown){return Number.isSafeInteger(v)?Number(v):undefined;}
function stringArray(v:unknown):readonly string[]|undefined{return Array.isArray(v)?v.filter((x):x is string=>typeof x==="string"):undefined;}
function stringRecord(v:unknown):Readonly<Record<string,string>>|undefined{if(!v||typeof v!=="object"||Array.isArray(v))return undefined;return Object.fromEntries(Object.entries(v as Record<string,unknown>).filter(([,x])=>typeof x==="string")) as Record<string,string>;}
function objectRecord(v:unknown):Readonly<Record<string,unknown>>|undefined{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:undefined;}
async function taskUid(response:Response):Promise<number>{const body=await response.json() as TaskSummary;if(!Number.isSafeInteger(body.taskUid))throw new Error("Meilisearch response did not include taskUid");return body.taskUid;}
async function apiError(prefix:string,response:Response){const text=await response.text().catch(()=>"");return new Error(`${prefix} (${response.status})${text?`: ${text.slice(0,500)}`:""}`);}
function delay(ms:number){return new Promise<void>((resolve)=>setTimeout(resolve,ms));}
