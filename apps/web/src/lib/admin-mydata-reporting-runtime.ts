import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { myDataReportingDiagnostic } from "./mydata-reporting-runtime";

export async function adminMyDataReportingDiagnostic(
  principal:SessionPrincipal,
  input:{dateFrom:string;dateTo:string;maxPages?:number}
){
  assertAdminPermission(principal,"finance.read");
  return myDataReportingDiagnostic(input);
}
