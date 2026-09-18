import { readFileSync } from "node:fs";

const files = {
  privacyControls: read("apps/web/src/app/privacy-controls/page.tsx"),
  accountPrivacyClient: read("apps/web/src/components/AccountPrivacyRightsClient.tsx"),
  accountPrivacyRequest: read("apps/web/src/app/api/account/privacy/request/route.ts"),
  customerSupportRuntime: read("apps/web/src/lib/customer-support-runtime.ts"),
  adminPrivacyPage: read("apps/web/src/app/admin/privacy/page.tsx"),
  adminPrivacyAutomation: read("apps/web/src/components/AdminPrivacyRequestAutomation.tsx"),
  adminPrivacyOperations: read("apps/web/src/lib/admin-privacy-operations.ts"),
  privacyReportRuntime: read("apps/web/src/lib/privacy-report-runtime.ts"),
  adminExecuteRoute: read("apps/web/src/app/api/admin/privacy/execute/route.ts"),
  adminRespondRoute: read("apps/web/src/app/api/admin/privacy/respond/route.ts"),
  legacyAdminActionRoute: read("apps/web/src/app/api/admin/privacy/action/route.ts"),
  adminReportRoute: read("apps/web/src/app/api/admin/privacy/report/route.ts"),
  accountReportRoute: read("apps/web/src/app/api/account/privacy/report/[requestId]/route.ts"),
  supportQueue: read("apps/web/src/lib/admin-customer-support-queue.ts"),
  supportPage: read("apps/web/src/app/admin/customers/support/page.tsx"),
  trustPage: read("apps/web/src/app/admin/trust/page.tsx")
};

const failures:string[]=[];
expect(files.privacyControls,"linked support case","public privacy controls explain the linked operational workflow");
expect(files.privacyControls,"χειροκίνητη επιβεβαίωση","public privacy controls disclose manual response confirmation");
expect(files.accountPrivacyRequest,"ensureCustomerPrivacySupportCase","customer GDPR request creates/links a support case");
expect(files.customerSupportRuntime,'category:\"privacy\"',"privacy support notification payload is present");
expect(files.customerSupportRuntime,"privacy.support_case_linked","privacy support case creation is audited");
expect(files.supportQueue,"selectedCategory","support queue supports a category filter");
expect(files.supportPage,'value="privacy"',"support UI exposes a GDPR/privacy filter");
expect(files.supportPage,"Open GDPR workspace","linked privacy cases route to the governed GDPR workspace");
expect(files.trustPage,'href: "/admin/privacy"',"Trust routes Privacy to the specialist GDPR workspace");
expect(files.trustPage,"one-click actions","Trust describes the operational privacy workflow");

expect(files.adminPrivacyPage,"AdminPrivacyRequestAutomation","admin privacy page mounts request-specific automation");
expect(files.adminPrivacyPage,"Customer Support","admin privacy page links back to customer support");
expect(files.adminPrivacyAutomation,"window.confirm","destructive/final privacy actions require explicit Admin confirmation");
expect(files.adminPrivacyAutomation,"Send response & close request","final customer response is a manual Admin action");
expect(files.adminPrivacyAutomation,"PDF report","Admin can generate/download a PDF report");
expect(files.adminPrivacyAutomation,"JSON export","Admin can generate/download a structured export");

expect(files.adminExecuteRoute,'permission:"privacy.manage"',"privacy execution requires privacy.manage");
expect(files.adminExecuteRoute,"executeAdminPrivacyRequest","privacy execution route runs request-specific operation");
expect(files.adminRespondRoute,'permission:"privacy.manage"',"privacy response requires privacy.manage");
expect(files.adminRespondRoute,"sendAdminPrivacyResponse","manual response route sends/finalizes the GDPR response");
expect(files.legacyAdminActionRoute,"legacy_privacy_action_disabled","legacy status-only privacy completion route is disabled");
expect(files.adminPrivacyOperations,"sendTransactionalEmail","privacy final response uses transactional email");
expect(files.adminPrivacyOperations,"manualAdminConfirmation:true","privacy outcome records manual Admin confirmation");
expect(files.adminPrivacyOperations,"accountClosurePending:true","account closure is prepared before the final manual confirmation");
expect(files.adminPrivacyOperations,"closeCustomerAccountForPrivacy","account closure executes through governed privacy workflow");
expect(files.adminPrivacyOperations,"adminUpdateCustomerProfile","correction uses the governed Admin customer profile path");

expect(files.privacyReportRuntime,'exportVersion:"2.0"',"privacy report uses a versioned export format");
expect(files.privacyReportRuntime,"renderPrivacyReportPdf","PDF report generation is implemented");
expect(files.privacyReportRuntime,"privacyReportJson","JSON portability export is implemented");
for(const marker of ["orders","payments","returns","askLocalRequests","messages","giftCards","savedSearches","notifications","deliveryJobs","privacyRequests","supportCases"]){
  expect(files.privacyReportRuntime,marker,`privacy export is missing data surface: ${marker}`);
}
expect(files.adminReportRoute,'permission:"privacy.read"',"Admin report download requires privacy.read");
expect(files.accountReportRoute,"requireAccountSession","customer report download requires authenticated account");
expect(files.accountReportRoute,"state.privacyRequests.find","customer report download verifies request ownership");
expect(files.accountReportRoute,'["access","export"].includes(item.type)',"customer report is limited to access/export request types");
expect(files.accountReportRoute,"privacy_report_not_ready","customer cannot download before Admin prepares the report");

if(files.accountPrivacyRequest.includes("sendTransactionalEmail")) failures.push("customer privacy request submission must never email a final GDPR response automatically");
if(files.adminExecuteRoute.includes("sendTransactionalEmail")) failures.push("privacy execute route must not send the customer response automatically");
if(!files.adminRespondRoute.includes("sendAdminPrivacyResponse")) failures.push("final response must remain behind the explicit Admin respond route");

if(failures.length){
  console.error("Privacy operations checks failed:\n"+failures.map((f)=>`- ${f}`).join("\n"));
  process.exit(1);
}
console.log("GDPR request routing, one-click Admin execution, report generation, support linkage and manual-response boundaries passed.");

function read(path:string):string{return readFileSync(new URL(`../${path}`,import.meta.url),"utf8");}
function expect(content:string,needle:string,label:string):void{if(!content.includes(needle))failures.push(label);}
