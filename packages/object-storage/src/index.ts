import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type ObjectStorageConfig = Readonly<{
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  uploadTtlSeconds: number;
}>;

export type StoredObjectMetadata = Readonly<{ objectKey:string; contentType?:string; byteSize:number; etag?:string }>;
export type StoredObjectRead = Readonly<{ objectKey:string; stream:AsyncIterable<Uint8Array>; etag?:string; byteSize?:number; contentType?:string }>;

export class S3ObjectStorage {
  readonly #client: S3Client;
  readonly #config: ObjectStorageConfig;

  constructor(config: ObjectStorageConfig) {
    this.#config = config;
    const credentials = config.accessKeyId && config.secretAccessKey ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } : undefined;
    const clientConfig: S3ClientConfig = { region: config.region, endpoint: config.endpoint, forcePathStyle: config.forcePathStyle, credentials };
    this.#client = new S3Client(clientConfig);
  }

  async createUploadUrl(input: { objectKey: string; contentType: string; expiresInSeconds?: number }): Promise<{ url: string; headers: Readonly<Record<string,string>>; expiresInSeconds: number }> {
    const expiresInSeconds = input.expiresInSeconds ?? this.#config.uploadTtlSeconds;
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 3600) throw new Error("Upload URL expiry must be between 60 and 3600 seconds");
    const command = new PutObjectCommand({ Bucket: this.#config.bucket, Key: input.objectKey, ContentType: input.contentType });
    const url = await getSignedUrl(this.#client, command, { expiresIn: expiresInSeconds, signableHeaders: new Set(["content-type"]) });
    return { url, headers: { "content-type": input.contentType }, expiresInSeconds };
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

export function objectStorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStorageConfig {
  const bucket = env.BLS_OBJECT_STORAGE_BUCKET?.trim() || env.OBJECT_STORAGE_BUCKET?.trim();
  const region = env.BLS_OBJECT_STORAGE_REGION?.trim() || env.AWS_REGION?.trim();
  if (!bucket) throw new Error("BLS_OBJECT_STORAGE_BUCKET is required");
  if (!region) throw new Error("BLS_OBJECT_STORAGE_REGION is required");
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim() || env.OBJECT_STORAGE_ACCESS_KEY?.trim() || undefined;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim() || env.OBJECT_STORAGE_SECRET_KEY?.trim() || undefined;
  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) throw new Error("Object storage access key and secret must be configured together");
  return {
    bucket,
    region,
    endpoint: env.BLS_OBJECT_STORAGE_ENDPOINT?.trim() || env.OBJECT_STORAGE_ENDPOINT?.trim() || undefined,
    forcePathStyle: env.BLS_OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
    accessKeyId,
    secretAccessKey,
    uploadTtlSeconds: integer(env.BLS_MEDIA_UPLOAD_TTL_SECONDS, 900)
  };
}

function integer(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("BLS_MEDIA_UPLOAD_TTL_SECONDS must be a positive integer");
  return value;
}
