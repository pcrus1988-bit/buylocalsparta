// NYXI Agent 3: metadata-only, fail-closed asset mirror gate.
// Acquisition rights NEVER imply permission to copy evidence into Drive.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const PRIVATE_BUCKET = "nyxi-evidence";

function dateIsCurrent(value, now, allowEmpty = false) {
  if (!value) return allowEmpty;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > now;
}

export function mirrorDecision({ approval, snapshot, manifest, now = new Date() }) {
  const clock = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(clock)) throw new Error("invalid current time");
  const blocked = (state) => ({ rightsEligible: false, syncStatus: state });
  if (!snapshot || !UUID.test(snapshot.id || "") || !UUID.test(snapshot.source_id || "")) {
    return blocked("BLOCKED_SNAPSHOT_MISSING");
  }
  if (!manifest || manifest.snapshot_id !== snapshot.id || manifest.source_id !== snapshot.source_id) {
    return blocked("BLOCKED_MANIFEST_MISMATCH");
  }
  if (!approval || manifest.metadata?.asset_approval_id !== approval.id) {
    return blocked("BLOCKED_APPROVAL_MISSING");
  }
  if (approval.source_id !== snapshot.source_id) return blocked("BLOCKED_SOURCE_MISMATCH");
  if (snapshot.final_url !== (approval.approved_final_url || approval.asset_url)) {
    return blocked("BLOCKED_URL_MISMATCH");
  }
  if (approval.acquisition_authorized !== true) return blocked("BLOCKED_ACQUISITION_RIGHTS");
  if (approval.mirror_authorized !== true) return blocked("BLOCKED_MIRROR_RIGHTS");
  if (approval.metadata?.governance_approved !== true) return blocked("BLOCKED_GOVERNANCE");
  if (!approval.approved_at || Date.parse(approval.approved_at) > clock ||
      !dateIsCurrent(approval.review_due_at, clock) ||
      !dateIsCurrent(approval.expires_at, clock) ||
      !dateIsCurrent(approval.retention_until, clock, true)) {
    return blocked("BLOCKED_APPROVAL_STALE");
  }
  if (![approval.rights_basis, approval.attribution, approval.retention_policy]
    .every((v) => typeof v === "string" && v.trim().length > 0)) {
    return blocked("BLOCKED_RIGHTS_RETENTION");
  }
  if (snapshot.storage_bucket !== PRIVATE_BUCKET ||
      !SHA256.test(snapshot.sha256 || "") ||
      !snapshot.storage_path ||
      !Number.isFinite(Number(snapshot.byte_length)) ||
      Number(snapshot.byte_length) <= 0 ||
      manifest.corpus_state !== "archived") {
    return blocked("BLOCKED_ARCHIVE_PROVENANCE");
  }
  // This is only a rights decision, NOT an upload authorization. The uploader
  // must separately rehash the private archive and verify Drive bytes/metadata.
  return { rightsEligible: true, syncStatus: "PENDING_INDEPENDENT_BYTE_REHASH" };
}

export function deterministicMirrorName({ snapshot, sourceRole }) {
  if (!UUID.test(snapshot?.id || "") || !UUID.test(snapshot?.source_id || "") ||
      !SHA256.test(snapshot?.sha256 || "")) {
    throw new Error("invalid snapshot identity or SHA-256");
  }
  const basename = String(snapshot.storage_path || "").split("/").pop() || "";
  if (!basename || basename === "." || basename === ".." || !/^[\w.-]+$/.test(basename)) {
    throw new Error("invalid original archive filename");
  }
  const role = String(sourceRole || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return [snapshot.source_id, snapshot.id, snapshot.sha256, role, basename].join("__");
}

export function verifyDriveReadback({ expected, driveFile, actualSha256 }) {
  if (!driveFile?.id) return { verified: false, state: "PENDING_DRIVE_READBACK" };
  if (!Array.isArray(driveFile.parents) || !driveFile.parents.includes(expected.folderId)) {
    return { verified: false, state: "BLOCKED_DRIVE_PARENT_MISMATCH" };
  }
  if (driveFile.name !== expected.filename) {
    return { verified: false, state: "BLOCKED_DRIVE_FILENAME_MISMATCH" };
  }
  if (driveFile.mimeType !== expected.mimeType) {
    return { verified: false, state: "BLOCKED_DRIVE_MIME_MISMATCH" };
  }
  if (!SHA256.test(actualSha256 || "") || actualSha256 !== expected.sha256) {
    return { verified: false, state: "BLOCKED_DRIVE_SHA256_MISMATCH" };
  }
  return { verified: true, state: "VERIFIED" };
}

export function assertPrivateDriveRoot({ root, folders, config }) {
  if (config?.googleDrive?.root?.id !== "14clSoR6yEPDIhMmRwmkfGEGhI5mrZZ_Q") {
    throw new Error("canonical NYXI private root mismatch");
  }
  const allowed = Object.values(config.googleDrive.folders || {});
  if (allowed.length !== 9 || !root || root.id !== config.googleDrive.root.id) {
    throw new Error("NYXI root/folder configuration incomplete");
  }
  for (const item of [root, ...folders]) {
    if (item.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error("NYXI Drive target is not a folder");
    }
    if (!Array.isArray(item.permissions) || item.permissions.length === 0) {
      throw new Error("NYXI Drive permission metadata unavailable");
    }
    if (item.permissions.some((p) => p.type === "anyone" || p.type === "domain")) {
      throw new Error("NYXI Drive target has broad sharing permissions");
    }
  }
  for (const expected of allowed) {
    const found = folders.find((f) => f.id === expected.id);
    if (!found || found.name !== expected.name ||
        !Array.isArray(found.parents) ||
        !found.parents.includes(root.id)) {
      throw new Error("NYXI Drive child folder ID/parent mismatch");
    }
  }
  return true;
}
