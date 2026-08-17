import { createHash, randomBytes } from "node:crypto";
import type { StoredObjectMetadata, UploadIntent } from "./types.ts";

export interface ObjectStorage {
  issueUpload(input: { objectKey: string; allowedContentTypes: readonly string[]; maxBytes: number; now: number; ttlMs?: number }): UploadIntent;
  putWithIntent(input: { token: string; contentType: string; bytes: Uint8Array; now: number }): StoredObjectMetadata;
  head(objectKey: string): StoredObjectMetadata | undefined;
  get(objectKey: string): Uint8Array | undefined;
  delete(objectKey: string): void;
}

type PendingIntent = UploadIntent & { used: boolean };
type StoredObject = { metadata: StoredObjectMetadata; bytes: Uint8Array };

export class InMemoryObjectStorage implements ObjectStorage {
  readonly #intents = new Map<string, PendingIntent>();
  readonly #objects = new Map<string, StoredObject>();

  issueUpload(input: { objectKey: string; allowedContentTypes: readonly string[]; maxBytes: number; now: number; ttlMs?: number }): UploadIntent {
    if (!input.objectKey.trim() || input.objectKey.includes("..")) throw new Error("Invalid object key");
    if (!input.allowedContentTypes.length) throw new Error("At least one content type must be allowed");
    if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) throw new Error("Upload size limit must be a positive integer");
    const token = randomBytes(24).toString("base64url");
    const intent: PendingIntent = {
      token,
      objectKey: input.objectKey,
      allowedContentTypes: [...new Set(input.allowedContentTypes.map((value) => value.toLowerCase()))],
      maxBytes: input.maxBytes,
      expiresAt: input.now + (input.ttlMs ?? 15 * 60 * 1000),
      used: false
    };
    this.#intents.set(token, intent);
    return this.#publicIntent(intent);
  }

  putWithIntent(input: { token: string; contentType: string; bytes: Uint8Array; now: number }): StoredObjectMetadata {
    const intent = this.#intents.get(input.token);
    if (!intent || intent.used) throw new Error("Upload intent is invalid or already used");
    if (intent.expiresAt <= input.now) throw new Error("Upload intent has expired");
    const contentType = input.contentType.toLowerCase().trim();
    if (!intent.allowedContentTypes.includes(contentType)) throw new Error("Content type is not allowed for this upload");
    if (input.bytes.byteLength <= 0) throw new Error("Uploaded object is empty");
    if (input.bytes.byteLength > intent.maxBytes) throw new Error("Uploaded object exceeds size limit");
    const bytes = Uint8Array.from(input.bytes);
    const metadata: StoredObjectMetadata = {
      objectKey: intent.objectKey,
      contentType,
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      createdAt: input.now
    };
    this.#objects.set(intent.objectKey, { metadata, bytes });
    intent.used = true;
    return structuredClone(metadata);
  }

  head(objectKey: string): StoredObjectMetadata | undefined {
    const value = this.#objects.get(objectKey);
    return value ? structuredClone(value.metadata) : undefined;
  }

  get(objectKey: string): Uint8Array | undefined {
    const value = this.#objects.get(objectKey);
    return value ? Uint8Array.from(value.bytes) : undefined;
  }

  delete(objectKey: string): void {
    this.#objects.delete(objectKey);
  }

  #publicIntent(intent: PendingIntent): UploadIntent {
    return {
      token: intent.token,
      objectKey: intent.objectKey,
      allowedContentTypes: [...intent.allowedContentTypes],
      maxBytes: intent.maxBytes,
      expiresAt: intent.expiresAt
    };
  }
}
