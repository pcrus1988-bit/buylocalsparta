import { createHash } from "node:crypto";
import type { OutboxEvent } from "../common/outbox.ts";
import type { SearchDocument } from "./types.ts";

export interface SearchIndexBackend {
  upsert(document: SearchDocument): void | Promise<void>;
  remove(id: string): void | Promise<void>;
}

export type SearchProjectionResult = Readonly<{
  entityId: string;
  action: "upserted" | "removed" | "unchanged";
  documentHash?: string;
}>;

export type SearchProjectionResolver = (entityId: string, now: number) => SearchDocument | undefined | Promise<SearchDocument | undefined>;

/**
 * Converts domain state into one canonical public search document. The service is
 * backend-agnostic so the pilot can use LocalSearchEngine while production can use
 * Typesense/Meilisearch/OpenSearch without changing commerce logic.
 */
export class SearchIndexingService {
  readonly #backend: SearchIndexBackend;
  readonly #resolver: SearchProjectionResolver;
  readonly #hashes = new Map<string, string>();

  constructor(input: { backend: SearchIndexBackend; resolver: SearchProjectionResolver }) {
    this.#backend = input.backend;
    this.#resolver = input.resolver;
  }

  async reindex(entityId: string, now: number): Promise<SearchProjectionResult> {
    if (!entityId.trim()) throw new Error("Search reindex entity ID is required");
    const document = await this.#resolver(entityId, now);
    if (!document) {
      await this.#backend.remove(entityId);
      this.#hashes.delete(entityId);
      return { entityId, action: "removed" };
    }
    const documentHash = hashSearchDocument(document);
    if (this.#hashes.get(entityId) === documentHash) return { entityId, action: "unchanged", documentHash };
    await this.#backend.upsert(document);
    this.#hashes.set(entityId, documentHash);
    return { entityId, action: "upserted", documentHash };
  }

  async handle(event: OutboxEvent, now: number): Promise<SearchProjectionResult | undefined> {
    const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
    const entityId = String(payload.canonicalVariantId ?? payload.variantId ?? (event.aggregateType === "canonical_product" ? event.aggregateId : ""));
    if (!entityId) return undefined;
    return this.reindex(entityId, now);
  }

  knownHash(entityId: string): string | undefined {
    return this.#hashes.get(entityId);
  }
}

export function hashSearchDocument(document: SearchDocument): string {
  return createHash("sha256").update(stableStringify(document)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
