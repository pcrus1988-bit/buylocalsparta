import { PostgresProductTaxProfileService } from "@buy-local-sparta/postgres-runtime/product-tax-profiles";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const globalKey="__kontamouProductTaxProfileService" as const;
const globals=globalThis as typeof globalThis & { [globalKey]?:PostgresProductTaxProfileService };
function service(){if(!postgresAdminRuntimeEnabled())throw new Error("Product tax profiles require PostgreSQL runtime");return globals[globalKey]??(globals[globalKey]=new PostgresProductTaxProfileService(getProductionPostgresRuntime().sqlPool,process.env));}

export async function adminProductTaxWorkspace(principal:SessionPrincipal){assertAdminPermission(principal,"finance.read");if(!postgresAdminRuntimeEnabled())return undefined;return service().workspace(principal);}
export async function adminProposeProductTaxProfile(principal:SessionPrincipal,input:{variantId:string;vatCategory:number;vatExemptionCategory?:number;effectiveFrom:string;notes:string}){assertAdminPermission(principal,"finance.write");const result=await service().propose(principal,input);await recordAdminAudit(principal,"product_tax_profile.proposed","canonical_variant",input.variantId,input.notes,{profileId:result.profileId,vatCategory:input.vatCategory,effectiveFrom:input.effectiveFrom});return result;}
export async function adminApproveProductTaxProfile(principal:SessionPrincipal,input:{profileId:string;notes:string}){assertAdminPermission(principal,"finance.write");const result=await service().approve(principal,input);await recordAdminAudit(principal,"product_tax_profile.approved","product_tax_profile",input.profileId,input.notes,{policyVersion:result.policyVersion,profileHash:result.profileHash});return result;}
