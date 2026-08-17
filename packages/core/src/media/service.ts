import { createHash } from "node:crypto";
import { id } from "../common/ids.ts";
import type { CatalogManagementService } from "../catalog/management.ts";
import type { ObjectStorage } from "./storage.ts";
import type {
  ComplianceDocumentStatus,
  MediaKind,
  ProductComplianceDocument,
  ProductMediaAsset,
  ProductNotice,
  ProductNoticeSeverity,
  ProductNoticeType,
  MediaReviewStatus,
  UploadIntent
} from "./types.ts";

const MEDIA_RULES: Record<MediaKind, { contentTypes: readonly string[]; maxBytes: number }> = {
  image: { contentTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"], maxBytes: 12 * 1024 * 1024 },
  video: { contentTypes: ["video/mp4", "video/webm"], maxBytes: 150 * 1024 * 1024 },
  document: { contentTypes: ["application/pdf"], maxBytes: 25 * 1024 * 1024 }
};

function safeFilename(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Filename is required");
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload";
}

export class ProductMediaService {
  readonly #storage: ObjectStorage;
  readonly #assets = new Map<string, ProductMediaAsset>();
  readonly #pending = new Map<string, {
    canonicalVariantId: string;
    vendorId?: string;
    kind: MediaKind;
    originalFilename: string;
    altText?: string;
    rightsOwner?: string;
  }>();

  constructor(storage: ObjectStorage) {
    this.#storage = storage;
  }

  createUploadIntent(input: {
    canonicalVariantId: string;
    vendorId?: string;
    kind: MediaKind;
    originalFilename: string;
    altText?: string;
    rightsOwner?: string;
    now: number;
  }): UploadIntent {
    if (!input.canonicalVariantId.trim()) throw new Error("Canonical variant is required");
    const filename = safeFilename(input.originalFilename);
    if (input.kind === "image" && !input.altText?.trim()) throw new Error("Image alt text is required");
    if (!input.rightsOwner?.trim()) throw new Error("Media rights owner is required");
    const rules = MEDIA_RULES[input.kind];
    const nonce = id("upload");
    const ownerSegment = input.vendorId?.trim() || "platform";
    const objectKey = `product-media/${input.canonicalVariantId}/${ownerSegment}/${nonce}-${filename}`;
    const intent = this.#storage.issueUpload({ objectKey, allowedContentTypes: rules.contentTypes, maxBytes: rules.maxBytes, now: input.now });
    this.#pending.set(intent.token, {
      canonicalVariantId: input.canonicalVariantId,
      vendorId: input.vendorId,
      kind: input.kind,
      originalFilename: filename,
      altText: input.altText?.trim() || undefined,
      rightsOwner: input.rightsOwner.trim()
    });
    return intent;
  }

  uploadAndFinalize(input: {
    intentToken: string;
    contentType: string;
    bytes: Uint8Array;
    now: number;
    expectedVendorId?: string;
  }): ProductMediaAsset {
    const pending = this.#pending.get(input.intentToken);
    if (!pending) throw new Error("Unknown media upload intent");
    if (input.expectedVendorId !== undefined && pending.vendorId !== input.expectedVendorId) throw new Error("Media upload intent belongs to another vendor");
    const metadata = this.#storage.putWithIntent({ token: input.intentToken, contentType: input.contentType, bytes: input.bytes, now: input.now });
    const asset: ProductMediaAsset = {
      id: id("media"),
      canonicalVariantId: pending.canonicalVariantId,
      vendorId: pending.vendorId,
      kind: pending.kind,
      objectKey: metadata.objectKey,
      originalFilename: pending.originalFilename,
      contentType: metadata.contentType,
      byteSize: metadata.byteSize,
      sha256: metadata.sha256,
      altText: pending.altText,
      rightsOwner: pending.rightsOwner,
      rightsStatus: "pending",
      moderationStatus: "pending",
      scanStatus: "pending",
      createdAt: input.now
    };
    this.#assets.set(asset.id, asset);
    this.#pending.delete(input.intentToken);
    return structuredClone(asset);
  }

  recordScan(input: { assetId: string; result: "clean" | "infected" | "failed"; now: number; reason?: string }): ProductMediaAsset {
    const asset = this.#required(input.assetId);
    const next: ProductMediaAsset = {
      ...asset,
      scanStatus: input.result,
      moderationStatus: input.result === "infected" ? "rejected" : asset.moderationStatus,
      rejectionReason: input.result === "infected" ? (input.reason?.trim() || "Malware scan rejected upload") : asset.rejectionReason
    };
    this.#assets.set(asset.id, next);
    return structuredClone(next);
  }

  review(input: { assetId: string; actorId: string; rightsStatus?: MediaReviewStatus; moderationStatus?: MediaReviewStatus; reason?: string; now: number }): ProductMediaAsset {
    const asset = this.#required(input.assetId);
    const rightsStatus = input.rightsStatus ?? asset.rightsStatus;
    const moderationStatus = input.moderationStatus ?? asset.moderationStatus;
    if (moderationStatus === "approved" && asset.scanStatus !== "clean") throw new Error("Media cannot be approved before a clean malware scan");
    if ((rightsStatus === "rejected" || moderationStatus === "rejected") && !input.reason?.trim()) throw new Error("Rejected media requires a reason");
    const next: ProductMediaAsset = {
      ...asset,
      rightsStatus,
      moderationStatus,
      rejectionReason: rightsStatus === "rejected" || moderationStatus === "rejected" ? input.reason!.trim() : undefined,
      reviewedAt: input.now,
      reviewedBy: input.actorId
    };
    this.#assets.set(asset.id, next);
    return structuredClone(next);
  }

  publicAssets(canonicalVariantId: string): readonly ProductMediaAsset[] {
    return [...this.#assets.values()]
      .filter((asset) => asset.canonicalVariantId === canonicalVariantId)
      .filter((asset) => asset.scanStatus === "clean" && asset.rightsStatus === "approved" && asset.moderationStatus === "approved")
      .map((asset) => structuredClone(asset));
  }

  vendorAssets(vendorId: string): readonly ProductMediaAsset[] {
    return [...this.#assets.values()].filter((asset) => asset.vendorId === vendorId).map((asset) => structuredClone(asset));
  }

  all(): readonly ProductMediaAsset[] {
    return [...this.#assets.values()].map((asset) => structuredClone(asset));
  }

  get(assetId: string): ProductMediaAsset | undefined {
    const asset = this.#assets.get(assetId);
    return asset ? structuredClone(asset) : undefined;
  }

  objectBytes(assetId: string): Uint8Array | undefined {
    const asset = this.#required(assetId);
    return this.#storage.get(asset.objectKey);
  }

  #required(assetId: string): ProductMediaAsset {
    const asset = this.#assets.get(assetId);
    if (!asset) throw new Error("Product media asset not found");
    return asset;
  }
}

export class ProductTrustService {
  readonly #catalog: CatalogManagementService;
  readonly #media: ProductMediaService;
  readonly #documents = new Map<string, ProductComplianceDocument>();
  readonly #notices = new Map<string, ProductNotice>();

  constructor(input: { catalog: CatalogManagementService; media: ProductMediaService }) {
    this.#catalog = input.catalog;
    this.#media = input.media;
  }

  submitComplianceDocument(input: {
    canonicalVariantId: string;
    vendorId?: string;
    type: string;
    issuer?: string;
    identifier?: string;
    mediaAssetId?: string;
    validFrom?: number;
    validTo?: number;
    now: number;
  }): ProductComplianceDocument {
    if (!this.#catalog.canonical(input.canonicalVariantId)) throw new Error("Canonical product not found");
    if (!input.type.trim()) throw new Error("Compliance document type is required");
    if (input.validFrom !== undefined && input.validTo !== undefined && input.validTo < input.validFrom) throw new Error("Compliance validity dates are invalid");
    if (input.mediaAssetId) {
      const media = this.#media.get(input.mediaAssetId);
      if (!media || media.canonicalVariantId !== input.canonicalVariantId || media.kind !== "document") throw new Error("Compliance document media does not belong to this product");
      if (input.vendorId && media.vendorId && media.vendorId !== input.vendorId) throw new Error("Compliance document media vendor mismatch");
    }
    const document: ProductComplianceDocument = {
      id: id("compliance"),
      canonicalVariantId: input.canonicalVariantId,
      vendorId: input.vendorId,
      type: input.type.trim(),
      issuer: input.issuer?.trim() || undefined,
      identifier: input.identifier?.trim() || undefined,
      mediaAssetId: input.mediaAssetId,
      validFrom: input.validFrom,
      validTo: input.validTo,
      status: "pending",
      createdAt: input.now
    };
    this.#documents.set(document.id, document);
    return structuredClone(document);
  }

  reviewComplianceDocument(input: { documentId: string; actorId: string; decision: "verified" | "rejected"; reason?: string; now: number }): ProductComplianceDocument {
    const document = this.#requiredDocument(input.documentId);
    if (input.decision === "rejected" && !input.reason?.trim()) throw new Error("Rejected compliance document requires a reason");
    if (input.decision === "verified" && document.mediaAssetId) {
      const media = this.#media.get(document.mediaAssetId);
      if (!media || media.scanStatus !== "clean" || media.rightsStatus !== "approved" || media.moderationStatus !== "approved") {
        throw new Error("Compliance evidence media must pass scan, rights and moderation review before verification");
      }
    }
    const status: ComplianceDocumentStatus = input.decision;
    const next: ProductComplianceDocument = {
      ...document,
      status,
      verifiedAt: input.now,
      verifiedBy: input.actorId,
      rejectionReason: status === "rejected" ? input.reason!.trim() : undefined
    };
    this.#documents.set(document.id, next);
    return structuredClone(next);
  }

  refreshExpiry(now: number): number {
    let changed = 0;
    for (const [documentId, document] of this.#documents) {
      if (document.status === "verified" && document.validTo !== undefined && document.validTo < now) {
        this.#documents.set(documentId, { ...document, status: "expired" });
        changed += 1;
      }
    }
    return changed;
  }

  openNotice(input: { canonicalVariantId: string; type: ProductNoticeType; severity: ProductNoticeSeverity; details: string; actorId: string; now: number }): ProductNotice {
    if (!input.details.trim()) throw new Error("Product notice details are required");
    if (!this.#catalog.canonical(input.canonicalVariantId)) throw new Error("Canonical product not found");
    const notice: ProductNotice = {
      id: id("notice"),
      canonicalVariantId: input.canonicalVariantId,
      type: input.type,
      severity: input.severity,
      details: input.details.trim(),
      status: "open",
      openedBy: input.actorId,
      openedAt: input.now
    };
    this.#notices.set(notice.id, notice);
    if (input.type === "recall") this.#catalog.setCanonicalAvailability({ canonicalVariantId: input.canonicalVariantId, suppressed: true, recalled: true, now: input.now });
    else if (input.type === "compliance_hold") this.#catalog.setCanonicalAvailability({ canonicalVariantId: input.canonicalVariantId, suppressed: true, now: input.now });
    return structuredClone(notice);
  }

  resolveNotice(input: { noticeId: string; actorId: string; resolution: string; now: number }): ProductNotice {
    const notice = this.#requiredNotice(input.noticeId);
    if (notice.status === "resolved") return structuredClone(notice);
    if (!input.resolution.trim()) throw new Error("Notice resolution is required");
    const next: ProductNotice = { ...notice, status: "resolved", resolvedBy: input.actorId, resolvedAt: input.now, resolution: input.resolution.trim() };
    this.#notices.set(notice.id, next);
    return structuredClone(next);
  }

  restoreProduct(input: { canonicalVariantId: string; actorId: string; reason: string; now: number }): void {
    if (!input.reason.trim()) throw new Error("Restoring a suppressed product requires a reason");
    const blocking = [...this.#notices.values()].filter((notice) => notice.canonicalVariantId === input.canonicalVariantId && notice.status === "open" && (notice.type === "recall" || notice.type === "compliance_hold"));
    if (blocking.length) throw new Error("Product still has an open blocking notice");
    this.#catalog.setCanonicalAvailability({ canonicalVariantId: input.canonicalVariantId, suppressed: false, recalled: false, now: input.now });
  }

  documents(filter: { canonicalVariantId?: string; vendorId?: string } = {}): readonly ProductComplianceDocument[] {
    return [...this.#documents.values()]
      .filter((document) => !filter.canonicalVariantId || document.canonicalVariantId === filter.canonicalVariantId)
      .filter((document) => !filter.vendorId || document.vendorId === filter.vendorId)
      .map((document) => structuredClone(document));
  }

  notices(canonicalVariantId?: string): readonly ProductNotice[] {
    return [...this.#notices.values()].filter((notice) => !canonicalVariantId || notice.canonicalVariantId === canonicalVariantId).map((notice) => structuredClone(notice));
  }

  productFingerprint(canonicalVariantId: string): string {
    const canonical = this.#catalog.canonical(canonicalVariantId);
    if (!canonical) throw new Error("Canonical product not found");
    const documents = this.documents({ canonicalVariantId }).filter((document) => document.status === "verified").map((document) => `${document.type}:${document.identifier ?? ""}:${document.validTo ?? ""}`).sort();
    return createHash("sha256").update(JSON.stringify({ identity: canonical.identity, documents })).digest("hex");
  }

  #requiredDocument(documentId: string): ProductComplianceDocument {
    const document = this.#documents.get(documentId);
    if (!document) throw new Error("Compliance document not found");
    return document;
  }

  #requiredNotice(noticeId: string): ProductNotice {
    const notice = this.#notices.get(noticeId);
    if (!notice) throw new Error("Product notice not found");
    return notice;
  }
}
