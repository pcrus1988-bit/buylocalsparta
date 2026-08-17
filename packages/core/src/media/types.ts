export type MediaKind = "image" | "video" | "document";
export type MediaScanStatus = "pending" | "clean" | "infected" | "failed";
export type MediaReviewStatus = "pending" | "approved" | "rejected";

export type UploadIntent = Readonly<{
  token: string;
  objectKey: string;
  allowedContentTypes: readonly string[];
  maxBytes: number;
  expiresAt: number;
}>;

export type StoredObjectMetadata = Readonly<{
  objectKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  createdAt: number;
}>;

export type ProductMediaAsset = Readonly<{
  id: string;
  canonicalVariantId: string;
  vendorId?: string;
  kind: MediaKind;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  altText?: string;
  rightsOwner?: string;
  rightsStatus: MediaReviewStatus;
  moderationStatus: MediaReviewStatus;
  scanStatus: MediaScanStatus;
  rejectionReason?: string;
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
}>;

export type ComplianceDocumentStatus = "pending" | "verified" | "rejected" | "expired";

export type ProductComplianceDocument = Readonly<{
  id: string;
  canonicalVariantId: string;
  vendorId?: string;
  type: string;
  issuer?: string;
  identifier?: string;
  mediaAssetId?: string;
  validFrom?: number;
  validTo?: number;
  status: ComplianceDocumentStatus;
  createdAt: number;
  verifiedAt?: number;
  verifiedBy?: string;
  rejectionReason?: string;
}>;

export type ProductNoticeType = "safety_notice" | "recall" | "compliance_hold" | "content_notice";
export type ProductNoticeSeverity = "low" | "medium" | "high" | "critical";

export type ProductNotice = Readonly<{
  id: string;
  canonicalVariantId: string;
  type: ProductNoticeType;
  severity: ProductNoticeSeverity;
  details: string;
  status: "open" | "resolved";
  openedBy: string;
  openedAt: number;
  resolvedBy?: string;
  resolvedAt?: number;
  resolution?: string;
}>;
