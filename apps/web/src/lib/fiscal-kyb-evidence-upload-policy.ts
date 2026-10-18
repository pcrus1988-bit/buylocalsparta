/**
 * Future KYB attachment intake contract. M29 intentionally does NOT accept
 * uploads or persist files. These checks do not replace backend content
 * sniffing, virus scanning, private encryption or legal sign-off.
 */
export const fiscalKybDocumentTypes=Object.freeze([
 {extension:"pdf",mime:"application/pdf"},
 {extension:"png",mime:"image/png"},
 {extension:"jpg",mime:"image/jpeg"},
 {extension:"jpeg",mime:"image/jpeg"}
] as const);

export type FiscalKybCandidateFile=Readonly<{
 filename:string;mimeType:string;byteLength:number;sha256:string;
}>;
export type FiscalKybCandidateEvaluation=Readonly<{
 metadataAccepted:boolean;
 reason:string;
 requiresMagicByteCheck:true;
 requiresMalwareScan:true;
 mayUpload:false;
 mayPersist:false;
}>;

const maxBytes=5*1024*1024;
const filename=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const checksum=/^[0-9a-f]{64}$/;

export function evaluateFiscalKybCandidateFile(
 raw:unknown
):FiscalKybCandidateEvaluation{
 const deny=(reason:string)=>Object.freeze({
  metadataAccepted:false,reason,requiresMagicByteCheck:true as const,
  requiresMalwareScan:true as const,mayUpload:false as const,mayPersist:false as const
 });
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return deny("INVALID_METADATA");
 const item=raw as Record<string,unknown>;
 if(Object.keys(item).sort().join(",")!=="byteLength,filename,mimeType,sha256")return deny("UNKNOWN_FIELDS");
 if(typeof item.filename!=="string"||!filename.test(item.filename)||
   item.filename.includes("..")||item.filename.startsWith(".")||
   typeof item.mimeType!=="string"||typeof item.byteLength!=="number"||
   !Number.isSafeInteger(item.byteLength)||item.byteLength<=0||
   item.byteLength>maxBytes||typeof item.sha256!=="string"||!checksum.test(item.sha256))
   return deny("INVALID_METADATA");
 const parts=item.filename.toLowerCase().split(".");
 if(parts.length!==2 || !parts[0])return deny("AMBIGUOUS_FILENAME");
 const extension=parts[1];
 const acceptable=fiscalKybDocumentTypes.some(type=>
   type.extension===extension&&type.mime===item.mimeType);
 if(!acceptable)return deny("UNSUPPORTED_FILE_TYPE");
 return Object.freeze({
  metadataAccepted:true,reason:"METADATA_ONLY_NEEDS_SCAN",
  requiresMagicByteCheck:true as const,requiresMalwareScan:true as const,
  mayUpload:false as const,mayPersist:false as const
 });
}

export type FiscalKybStorageGateInputs=Readonly<{
 privateBucketVerified:boolean;
 tenantPathIsolationVerified:boolean;
 encryptionAtRestVerified:boolean;
 malwareQuarantineVerified:boolean;
 accessAuditVerified:boolean;
 retentionDeletionApproved:boolean;
 sensitiveDataLegalBasisReviewed:boolean;
 incidentResponseDrillPassed:boolean;
 operatorMfaReviewed:boolean;
}>;
export type FiscalKybStorageGate=Readonly<{
 gates:readonly Readonly<{id:keyof FiscalKybStorageGateInputs;verified:boolean}>[];
 allTechnicalInputsMarked:boolean;
 goLiveApprovalConfirmed:false;
 acceptingUploads:false;
 automaticKybApproval:false;
 issuanceEnabled:false;
}>;

export function fiscalKybStorageReadiness(
 input:FiscalKybStorageGateInputs
):FiscalKybStorageGate{
 if(!input||typeof input!=="object")throw new Error("KYB_STORAGE_GATE_INVALID");
 const keys=[
  "privateBucketVerified","tenantPathIsolationVerified","encryptionAtRestVerified",
  "malwareQuarantineVerified","accessAuditVerified","retentionDeletionApproved",
  "sensitiveDataLegalBasisReviewed","incidentResponseDrillPassed","operatorMfaReviewed"
 ] as const;
 if(Object.keys(input).sort().join(",")!==[...keys].sort().join(",")||
    keys.some(key=>typeof input[key]!=="boolean"))
  throw new Error("KYB_STORAGE_GATE_INVALID");
 const gates=Object.freeze(keys.map(id=>Object.freeze({id,verified:input[id]})));
 return Object.freeze({
  gates,allTechnicalInputsMarked:gates.every(g=>g.verified),
  goLiveApprovalConfirmed:false as const,
  acceptingUploads:false as const,
  automaticKybApproval:false as const,
  issuanceEnabled:false as const
 });
}
