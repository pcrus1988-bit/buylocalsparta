import { createHash, randomUUID } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export function boxNowShippingEnabled(): boolean { return Boolean(process.env.DATABASE_URL?.trim()) && process.env.BLS_BOXNOW_ENABLED === "true"; }
function service() { const s=getProductionPostgresRuntime().boxNowShipping; if(!s) throw new Error("BOX NOW shipping is not configured"); return s; }
async function recordCarrierDisclosure(principal:SessionPrincipal,fulfilmentId:string){
  const runtime=getProductionPostgresRuntime();
  await runtime.persistence.security.record({
    id:`sec_${randomUUID()}`,
    type:"personal_data.revealed",
    severity:"low",
    route:"/api/vendor/shipping/create",
    method:"POST",
    subjectHash:createHash("sha256").update(`fulfilment:${fulfilmentId}`).digest("hex"),
    actorUserId:principal.userId,
    details:{
      purpose:"carrier_fulfilment",
      resourceType:"carrier_shipment",
      dataClasses:"identity,contact,shipping",
      recordCount:1,
      accessScope:"individual",
      recipient:"BOX NOW"
    },
    occurredAt:Date.now()
  });
}
export async function vendorBoxNowWorkspace(principal:SessionPrincipal){ return service().workspace(principal); }
export async function createVendorBoxNowShipment(principal:SessionPrincipal, fulfilmentId:string){
  const result=await service().createOrReconcile(principal,{fulfilmentId});
  await recordCarrierDisclosure(principal,fulfilmentId);
  return result;
}
export async function handoverVendorBoxNowShipment(principal:SessionPrincipal,shipmentId:string){ return service().handover(principal,shipmentId); }
export async function vendorBoxNowLabel(principal:SessionPrincipal,shipmentId:string){
  const runtime=getProductionPostgresRuntime();
  const pdf=await service().labelPdf(principal,shipmentId);
  await runtime.persistence.security.record({
    id:`sec_${randomUUID()}`,
    type:"personal_data.exported",
    severity:"low",
    route:"/api/vendor/shipping/label",
    method:"GET",
    subjectHash:createHash("sha256").update(`shipment:${shipmentId}`).digest("hex"),
    actorUserId:principal.userId,
    details:{
      purpose:"carrier_handover",
      resourceType:"shipment_label",
      dataClasses:"identity,contact,shipping",
      recordCount:1,
      accessScope:"individual",
      recipient:"assigned_vendor"
    },
    occurredAt:Date.now()
  });
  return pdf;
}
export async function adminBoxNowOrigins(principal:SessionPrincipal){ return service().adminOrigins(principal.userId); }
export async function configureAdminBoxNowOrigin(principal:SessionPrincipal,input:{vendorLocationId:string;providerLocationId:string}){ return service().configureOrigin({actorUserId:principal.userId,...input}); }
