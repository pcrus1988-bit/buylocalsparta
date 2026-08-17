import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export function boxNowShippingEnabled(): boolean { return Boolean(process.env.DATABASE_URL?.trim()) && process.env.BLS_BOXNOW_ENABLED === "true"; }
function service() { const s=getProductionPostgresRuntime().boxNowShipping; if(!s) throw new Error("BOX NOW shipping is not configured"); return s; }
export async function vendorBoxNowWorkspace(principal:SessionPrincipal){ return service().workspace(principal); }
export async function createVendorBoxNowShipment(principal:SessionPrincipal, fulfilmentId:string){ return service().createOrReconcile(principal,{fulfilmentId}); }
export async function handoverVendorBoxNowShipment(principal:SessionPrincipal,shipmentId:string){ return service().handover(principal,shipmentId); }
export async function vendorBoxNowLabel(principal:SessionPrincipal,shipmentId:string){ return service().labelPdf(principal,shipmentId); }
export async function adminBoxNowOrigins(principal:SessionPrincipal){ return service().adminOrigins(principal.userId); }
export async function configureAdminBoxNowOrigin(principal:SessionPrincipal,input:{vendorLocationId:string;providerLocationId:string}){ return service().configureOrigin({actorUserId:principal.userId,...input}); }
