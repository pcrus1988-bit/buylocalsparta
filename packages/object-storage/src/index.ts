import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type ObjectStorageConfig = Readonly<{
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  uploadTtlSeconds: number;
}>;

export type StoredObjectMetadata = Readonly<{ objectKey:string; contentType?:string; byteSize:number; etag?:string }>;
export type StoredObjectRead = Readonly<{ objectKey:string; stream:AsyncIterable<Uint8Array>; etag?:string; byteSize?:number; contentType?:string }>;
export type StoredObjectListItem = Readonly<{ objectKey:string; etag?:string; byteSize:number; lastModified?:number }>;

export type ServerObjectStorage = Readonly<{
  put(input: { objectKey: string; contentType: string; body: Uint8Array }): Promise<void>;
  head(objectKey: string): Promise<StoredObjectMetadata | undefined>;
  read(objectKey: string): Promise<StoredObjectRead>;
  delete(objectKey: string): Promise<void>;
}>;

export class S3ObjectStorage {
  readonly #client: S3Client;
  readonly #config: ObjectStorageConfig;

  constructor(config: ObjectStorageConfig) {
    this.#config = config;
    const credentials = config.accessKeyId && config.secretAccessKey ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}) } : undefined;
    const clientConfig: S3ClientConfig = { region: config.region, endpoint: config.endpoint, forcePathStyle: config.forcePathStyle, credentials };
    this.#client = new S3Client(clientConfig);
  }

  async put(input: { objectKey: string; contentType: string; body: Uint8Array }): Promise<void> {
    await this.#client.send(new PutObjectCommand({
      Bucket: this.#config.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      Body: input.body
    }));
  }

  async createUploadUrl(input: { objectKey: string; contentType: string; expiresInSeconds?: number }): Promise<{ url: string; headers: Readonly<Record<string,string>>; expiresInSeconds: number }> {
    const expiresInSeconds = input.expiresInSeconds ?? this.#config.uploadTtlSeconds;
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 3600) throw new Error("Upload URL expiry must be between 60 and 3600 seconds");
    const command = new PutObjectCommand({ Bucket: this.#config.bucket, Key: input.objectKey, ContentType: input.contentType });
    const url = await getSignedUrl(this.#client, command, { expiresIn: expiresInSeconds, signableHeaders: new Set(["content-type"]) });
    return { url, headers: { "content-type": input.contentType }, expiresInSeconds };
  }

  async list(input: { prefix?: string; maxKeys?: number; continuationToken?: string } = {}): Promise<{ items: readonly StoredObjectListItem[]; nextContinuationToken?: string }> {
    const maxKeys = Math.max(1, Math.min(1000, Math.floor(input.maxKeys ?? 100)));
    const result = await this.#client.send(new ListObjectsV2Command({
      Bucket: this.#config.bucket,
      Prefix: input.prefix || undefined,
      MaxKeys: maxKeys,
      ContinuationToken: input.continuationToken
    }));
    const items = (result.Contents || []).flatMap((entry): StoredObjectListItem[] => {
      if (!entry.Key) return [];
      const byteSize = Number(entry.Size ?? 0);
      return [{
        objectKey: entry.Key,
        etag: entry.ETag,
        byteSize: Number.isSafeInteger(byteSize) && byteSize >= 0 ? byteSize : 0,
        lastModified: entry.LastModified ? entry.LastModified.getTime() : undefined
      }];
    });
    return { items, nextContinuationToken: result.NextContinuationToken };
  }

  async head(objectKey: string): Promise<StoredObjectMetadata | undefined> {
    try {
      const result = await this.#client.send(new HeadObjectCommand({ Bucket: this.#config.bucket, Key: objectKey }));
      const byteSize = Number(result.ContentLength ?? -1);
      if (!Number.isSafeInteger(byteSize) || byteSize < 0) throw new Error("Object storage returned an invalid Content-Length");
      return { objectKey, contentType: result.ContentType, byteSize, etag: result.ETag };
    } catch (error) {
      const status = typeof error === "object" && error && "$metadata" in error ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode) : undefined;
      if (status === 404) return undefined;
      throw error;
    }
  }

  async read(objectKey: string): Promise<StoredObjectRead> {
    const result = await this.#client.send(new GetObjectCommand({ Bucket: this.#config.bucket, Key: objectKey }));
    if (!result.Body) throw new Error("Object storage returned an empty body");
    if (!(Symbol.asyncIterator in Object(result.Body))) throw new Error("Object storage body is not streamable");
    return { objectKey, stream: result.Body as AsyncIterable<Uint8Array>, etag: result.ETag, byteSize: result.ContentLength == null ? undefined : Number(result.ContentLength), contentType: result.ContentType };
  }

  async promoteVerified(input:{sourceKey:string;verifiedKey:string;sourceEtag?:string}):Promise<StoredObjectMetadata>{
    const result=await this.#client.send(new CopyObjectCommand({Bucket:this.#config.bucket,Key:input.verifiedKey,CopySource:`${this.#config.bucket}/${input.sourceKey}`,CopySourceIfMatch:input.sourceEtag}));
    if(!result.CopyObjectResult?.ETag) throw new Error("Object storage did not confirm verified media copy");
    const verified=await this.head(input.verifiedKey);if(!verified)throw new Error("Verified media copy could not be read after promotion");return verified;
  }

  async delete(objectKey: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#config.bucket, Key: objectKey }));
  }

  async readiness(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.#client.send(new HeadBucketCommand({ Bucket: this.#config.bucket }));
      return { ok: true, message: "Object storage bucket is reachable" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}


export type SupabaseRestObjectStorageConfig = Readonly<{
  baseUrl: string;
  secretKey: string;
  bucket: string;
}>;

export class SupabaseRestObjectStorage implements ServerObjectStorage {
  readonly #baseUrl: string;
  readonly #secretKey: string;
  readonly #bucket: string;

  constructor(config: SupabaseRestObjectStorageConfig) {
    this.#baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.#secretKey = config.secretKey;
    this.#bucket = config.bucket;
  }

  #url(objectKey: string): string {
    const bucket = encodeURIComponent(this.#bucket);
    const key = objectKey.split("/").map((segment) => encodeURIComponent(segment)).join("/");
    return `${this.#baseUrl}/storage/v1/object/${bucket}/${key}`;
  }

  #headers(contentType?: string): Record<string, string> {
    return {
      apikey: this.#secretKey,
      authorization: `Bearer ${this.#secretKey}`,
      ...(contentType ? { "content-type": contentType } : {})
    };
  }

  async put(input: { objectKey: string; contentType: string; body: Uint8Array }): Promise<void> {
    const response = await fetch(this.#url(input.objectKey), {
      method: "POST",
      headers: {
        ...this.#headers(input.contentType),
        "x-upsert": "false"
      },
      body: Buffer.from(input.body)
    });
    if (!response.ok) throw new Error(`Object storage upload failed with HTTP ${response.status}`);
  }

  async head(objectKey: string): Promise<StoredObjectMetadata | undefined> {
    const response = await fetch(this.#url(objectKey), { headers: this.#headers(), cache: "no-store" });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Object storage metadata read failed with HTTP ${response.status}`);
    const body = new Uint8Array(await response.arrayBuffer());
    return {
      objectKey,
      contentType: response.headers.get("content-type")?.split(";")[0]?.trim() || undefined,
      byteSize: body.byteLength,
      etag: response.headers.get("etag") || undefined
    };
  }

  async read(objectKey: string): Promise<StoredObjectRead> {
    const response = await fetch(this.#url(objectKey), { headers: this.#headers(), cache: "no-store" });
    if (!response.ok || !response.body) {
      throw new Error(response.status === 404
        ? "Object storage object was not found"
        : `Object storage read failed with HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const stream = (async function* (): AsyncIterable<Uint8Array> {
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) return;
          if (next.value) yield next.value;
        }
      } finally {
        reader.releaseLock();
      }
    })();
    const length = Number(response.headers.get("content-length") ?? "");
    return {
      objectKey,
      stream,
      contentType: response.headers.get("content-type")?.split(";")[0]?.trim() || undefined,
      byteSize: Number.isSafeInteger(length) && length >= 0 ? length : undefined,
      etag: response.headers.get("etag") || undefined
    };
  }

  async delete(objectKey: string): Promise<void> {
    const response = await fetch(this.#url(objectKey), {
      method: "DELETE",
      headers: this.#headers(),
      cache: "no-store"
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Object storage delete failed with HTTP ${response.status}`);
    }
  }
}

export function serverObjectStorageFromEnv(
  input: { env?: NodeJS.ProcessEnv; defaultBucket?: string } = {}
): ServerObjectStorage {
  const env = input.env ?? process.env;
  const s3Bucket = env.BLS_OBJECT_STORAGE_BUCKET?.trim() || env.OBJECT_STORAGE_BUCKET?.trim();
  const s3Region = env.BLS_OBJECT_STORAGE_REGION?.trim() || env.AWS_REGION?.trim();
  if (s3Bucket && s3Region) return new S3ObjectStorage(objectStorageConfigFromEnv(env));

  const baseUrl = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const secretKey = (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  const bucket = s3Bucket || input.defaultBucket?.trim();
  if (baseUrl && secretKey && bucket) {
    return new SupabaseRestObjectStorage({ baseUrl, secretKey, bucket });
  }

  throw new Error("Server object storage is not configured");
}

export function objectStorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStorageConfig {
  const bucket = env.BLS_OBJECT_STORAGE_BUCKET?.trim() || env.OBJECT_STORAGE_BUCKET?.trim();
  const region = env.BLS_OBJECT_STORAGE_REGION?.trim() || env.AWS_REGION?.trim();
  if (!bucket) throw new Error("BLS_OBJECT_STORAGE_BUCKET is required");
  if (!region) throw new Error("BLS_OBJECT_STORAGE_REGION is required");

  // BLS_* is the canonical production contract. AWS_* remains supported so the same
  // worker image can run on managed container platforms without secret duplication.
  const accessKeyId = env.BLS_OBJECT_STORAGE_ACCESS_KEY_ID?.trim()
    || env.AWS_ACCESS_KEY_ID?.trim()
    || env.OBJECT_STORAGE_ACCESS_KEY?.trim()
    || undefined;
  const secretAccessKey = env.BLS_OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim()
    || env.AWS_SECRET_ACCESS_KEY?.trim()
    || env.OBJECT_STORAGE_SECRET_KEY?.trim()
    || undefined;
  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) throw new Error("Object storage access key and secret must be configured together");

  const sessionToken = env.BLS_OBJECT_STORAGE_SESSION_TOKEN?.trim() || env.AWS_SESSION_TOKEN?.trim() || undefined;
  const endpoint = env.BLS_OBJECT_STORAGE_ENDPOINT?.trim() || env.OBJECT_STORAGE_ENDPOINT?.trim() || undefined;
  const forcePathStyleRaw = env.BLS_OBJECT_STORAGE_FORCE_PATH_STYLE?.trim();
  if (forcePathStyleRaw && forcePathStyleRaw !== "true" && forcePathStyleRaw !== "false") {
    throw new Error("BLS_OBJECT_STORAGE_FORCE_PATH_STYLE must be true or false");
  }
  const forcePathStyle = forcePathStyleRaw
    ? forcePathStyleRaw === "true"
    : isSupabaseStorageEndpoint(endpoint);

  return {
    bucket,
    region,
    endpoint,
    forcePathStyle,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    uploadTtlSeconds: integer(env.BLS_MEDIA_UPLOAD_TTL_SECONDS, 900)
  };
}

function isSupabaseStorageEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && url.hostname.toLowerCase().endsWith(".storage.supabase.co");
  } catch {
    return false;
  }
}

function integer(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("BLS_MEDIA_UPLOAD_TTL_SECONDS must be a positive integer");
  return value;
}
