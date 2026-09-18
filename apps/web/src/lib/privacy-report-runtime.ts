import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { PostgresUnitOfWork } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type PrivacyReportSnapshot = Readonly<{
  exportVersion:"2.0";
  generatedAt:number;
  subject:{
    userId:string;
    email:string;
    status:string;
    firstName?:string;
    lastName?:string;
    phone?:string;
    preferredLocale?:string;
    emailVerifiedAt?:string;
    accountCreatedAt?:string;
    accountUpdatedAt?:string;
    marketingConsent:boolean;
    recommendationsEnabled:boolean;
    recentlyViewedEnabled:boolean;
  };
  addresses:readonly Record<string,unknown>[];
  orders:readonly Record<string,unknown>[];
  orderLines:readonly Record<string,unknown>[];
  payments:readonly Record<string,unknown>[];
  refunds:readonly Record<string,unknown>[];
  paymentDisputes:readonly Record<string,unknown>[];
  returns:readonly Record<string,unknown>[];
  askLocalRequests:readonly Record<string,unknown>[];
  privateOffers:readonly Record<string,unknown>[];
  conversations:readonly Record<string,unknown>[];
  messages:readonly Record<string,unknown>[];
  giftCards:readonly Record<string,unknown>[];
  giftCardLedger:readonly Record<string,unknown>[];
  savedProducts:readonly Record<string,unknown>[];
  savedVendors:readonly Record<string,unknown>[];
  recentlyViewed:readonly Record<string,unknown>[];
  savedSearches:readonly Record<string,unknown>[];
  notifications:readonly Record<string,unknown>[];
  sessions:readonly Record<string,unknown>[];
  deliveryJobs:readonly Record<string,unknown>[];
  deliveryEvents:readonly Record<string,unknown>[];
  privacyRequests:readonly Record<string,unknown>[];
  supportCases:readonly Record<string,unknown>[];
  customerVisibleSupportMessages:readonly Record<string,unknown>[];
  counts:Record<string,number>;
}>;

function uow(){return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool,{statementTimeoutMs:30_000,lockTimeoutMs:5_000});}
function text(v:unknown){return typeof v==="string"?v:String(v??"");}
function optional(v:unknown){const s=typeof v==="string"?v.trim():"";return s||undefined;}
function integer(v:unknown){const n=Number(v??0);return Number.isFinite(n)?Math.trunc(n):0;}
function iso(v:unknown){if(!v)return undefined;const d=v instanceof Date?v:new Date(String(v));return Number.isFinite(d.getTime())?d.toISOString():undefined;}
function normalize(value:unknown):unknown{
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,normalize(item)]));
  }
  return value;
}
function plainRow(row:SqlRow):Record<string,unknown>{return normalize(row) as Record<string,unknown>;}

export async function buildPrivacyReportSnapshot(actorUserId:string,userId:string):Promise<PrivacyReportSnapshot>{
  if(!productionDatabaseConfigured()) throw new Error("Privacy export requires the production database");
  return uow().withTransaction(platformScope(actorUserId),async(tx)=>{
    const user=await tx.query<SqlRow>(`SELECT u.id::text AS user_uuid,u.public_id,u.email::text AS email,u.phone,u.status::text,u.preferred_locale,u.email_verified_at,u.created_at,u.updated_at,
      cp.first_name,cp.last_name,COALESCE(cp.marketing_consent,false) AS marketing_consent,
      COALESCE(cp.recommendations_enabled,false) AS recommendations_enabled,COALESCE(cp.recently_viewed_enabled,false) AS recently_viewed_enabled
      FROM users u LEFT JOIN customer_profiles cp ON cp.user_id=u.id WHERE u.public_id=$1 LIMIT 1`,[userId]);
    if(!user.rowCount) throw new Error("Customer not found");
    const row=user.rows[0];const uid=text(row.user_uuid);

    const addresses=await tx.query<SqlRow>(`SELECT public_id,label,recipient_name,company_name,vat_number,line1,line2,locality,region,postcode,country_code,phone,
      coordinates::text AS coordinates,is_default_billing,is_default_delivery,created_at,updated_at
      FROM addresses WHERE user_id=$1::uuid ORDER BY created_at DESC`,[uid]);

    const orders=await tx.query<SqlRow>(`SELECT public_id,order_number,status::text,fulfilment_preference::text,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,currency,
      billing_address_snapshot,shipping_address_snapshot,partial_fulfilment_allowed,terms_version,confirmed_at,cancelled_at,cancellation_reason,created_at,updated_at
      FROM customer_orders WHERE user_id=$1::uuid ORDER BY created_at DESC`,[uid]);

    const orderLines=await tx.query<SqlRow>(`SELECT ol.public_id,o.public_id AS order_public_id,cv.public_id AS canonical_variant_public_id,v.public_id AS vendor_public_id,
      ol.quantity,ol.product_snapshot,ol.retail_unit_price_minor,ol.tax_rate_bps,ol.tax_minor,ol.shipping_promise_snapshot,ol.attribution_snapshot,
      ol.status,ol.fulfilled_quantity,ol.refunded_quantity,ol.pricing_source,ol.source_reference,ol.fulfilled_at,ol.discount_allocation_minor,
      ol.platform_discount_minor,ol.vendor_discount_minor,ol.created_at
      FROM order_lines ol
      JOIN customer_orders o ON o.id=ol.order_id
      LEFT JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
      LEFT JOIN vendor_businesses v ON v.id=ol.vendor_id
      WHERE o.user_id=$1::uuid ORDER BY ol.created_at DESC`,[uid]);

    const payments=await tx.query<SqlRow>(`SELECT p.public_id,o.public_id AS order_public_id,p.provider,p.provider_payment_id,p.provider_order_code,p.provider_transaction_id,
      p.status::text,p.currency,p.authorised_minor,p.captured_minor,p.refunded_minor,p.provider_verified_at,p.created_at,p.updated_at
      FROM payments p JOIN customer_orders o ON o.id=p.order_id WHERE o.user_id=$1::uuid ORDER BY p.created_at DESC`,[uid]);

    const refunds=await tx.query<SqlRow>(`SELECT r.public_id,r.reference_number,o.public_id AS order_public_id,p.public_id AS payment_public_id,
      r.provider_refund_id,r.amount_minor,r.currency,r.status,r.reason,r.provider_status,r.failure_code,r.failure_message,r.created_at,r.completed_at,r.updated_at
      FROM refunds r JOIN customer_orders o ON o.id=r.order_id LEFT JOIN payments p ON p.id=r.payment_id
      WHERE o.user_id=$1::uuid ORDER BY r.created_at DESC`,[uid]);

    const paymentDisputes=await tx.query<SqlRow>(`SELECT d.public_id,d.reference_number,o.public_id AS order_public_id,p.public_id AS payment_public_id,d.provider,d.provider_case_id,
      d.reason_code,d.currency,d.amount_minor,d.status,d.evidence_deadline,d.outcome_reason,d.opened_at,d.submitted_at,d.resolved_at,d.closed_at
      FROM payment_disputes d JOIN customer_orders o ON o.id=d.order_id LEFT JOIN payments p ON p.id=d.payment_id
      WHERE o.user_id=$1::uuid ORDER BY d.created_at DESC`,[uid]);

    const returns=await tx.query<SqlRow>(`SELECT r.public_id,r.return_number,o.public_id AS order_public_id,r.reason_type,r.status::text,r.requested_remedy,r.evidence,r.notes,r.disposition,
      r.approved_at,r.received_at,r.inspected_at,r.refunded_at,r.source,r.eligibility_state,r.eligibility_basis,r.eligibility_reason,
      r.return_by_at,r.return_cost_payer,r.destination_instructions,r.carrier,r.tracking_number,r.inspection_findings,r.approved_remedy,
      r.price_reduction_minor,r.closed_at,r.created_at,r.updated_at
      FROM returns r JOIN customer_orders o ON o.id=r.order_id WHERE r.customer_user_id=$1::uuid ORDER BY r.created_at DESC`,[uid]);

    const askLocal=await tx.query<SqlRow>(`SELECT cr.public_id,cr.reference_number,cv.public_id AS canonical_variant_public_id,cr.source_url,cr.source_metadata,cr.requested_quantity,
      cr.postcode,cr.priorities,cr.status::text,cr.assignment_reason,cr.expires_at,cr.created_at,cr.updated_at
      FROM counteroffer_requests cr LEFT JOIN canonical_variants cv ON cv.id=cr.canonical_variant_id
      WHERE cr.customer_user_id=$1::uuid ORDER BY cr.created_at DESC`,[uid]);

    const privateOffers=await tx.query<SqlRow>(`SELECT po.public_id,cr.public_id AS ask_local_public_id,v.public_id AS vendor_public_id,cv.public_id AS canonical_variant_public_id,
      alt.public_id AS alternative_variant_public_id,po.price_minor,po.currency,po.inclusions,po.fulfilment_promise,po.status,po.expires_at,po.created_at
      FROM private_offers po
      JOIN counteroffer_requests cr ON cr.id=po.counteroffer_request_id
      LEFT JOIN vendor_businesses v ON v.id=po.vendor_id
      LEFT JOIN canonical_variants cv ON cv.id=po.canonical_variant_id
      LEFT JOIN canonical_variants alt ON alt.id=po.alternative_variant_id
      WHERE cr.customer_user_id=$1::uuid ORDER BY po.created_at DESC`,[uid]);

    const conversations=await tx.query<SqlRow>(`SELECT c.public_id,cv.public_id AS canonical_variant_public_id,v.public_id AS vendor_public_id,o.public_id AS order_public_id,
      c.status::text,c.created_at,c.updated_at,c.closed_at
      FROM conversations c
      LEFT JOIN canonical_variants cv ON cv.id=c.canonical_variant_id
      LEFT JOIN vendor_businesses v ON v.id=c.vendor_id
      LEFT JOIN customer_orders o ON o.id=c.order_id
      WHERE c.customer_user_id=$1::uuid ORDER BY c.created_at DESC`,[uid]);

    const messages=await tx.query<SqlRow>(`SELECT m.public_id,c.public_id AS conversation_public_id,m.sender_type,
      CASE WHEN m.sender_user_id=$1::uuid THEN 'customer' ELSE m.sender_type END AS sender_role,
      m.body,m.attachment_keys,m.read_at,m.moderation_status,m.created_at
      FROM messages m JOIN conversations c ON c.id=m.conversation_id
      WHERE c.customer_user_id=$1::uuid ORDER BY m.created_at ASC`,[uid]);

    const giftCards=await tx.query<SqlRow>(`SELECT gc.public_id,gc.code_suffix,gc.currency,gc.initial_value_minor,gc.balance_minor,gc.status,
      gc.recipient_name,gc.recipient_email::text,gc.message,gc.issue_channel,gc.issued_at,gc.activated_at,gc.expires_at,gc.revoked_at,gc.created_at,gc.updated_at,
      CASE WHEN gc.purchaser_user_id=$1::uuid THEN true ELSE false END AS purchased_by_subject,
      CASE WHEN gc.holder_user_id=$1::uuid THEN true ELSE false END AS held_by_subject
      FROM gift_cards gc WHERE gc.purchaser_user_id=$1::uuid OR gc.holder_user_id=$1::uuid ORDER BY gc.created_at DESC`,[uid]);

    const giftLedger=await tx.query<SqlRow>(`SELECT gl.public_id,gc.public_id AS gift_card_public_id,gl.entry_type,gl.amount_minor,gl.balance_after_minor,gl.currency,
      gl.order_public_id,gl.reason,gl.metadata,gl.created_at
      FROM gift_card_ledger gl JOIN gift_cards gc ON gc.id=gl.gift_card_id
      WHERE gc.purchaser_user_id=$1::uuid OR gc.holder_user_id=$1::uuid ORDER BY gl.created_at DESC`,[uid]);

    const savedProducts=await tx.query<SqlRow>(`SELECT sp.public_id,cv.public_id AS canonical_variant_public_id,sp.saved_at
      FROM saved_products sp JOIN canonical_variants cv ON cv.id=sp.canonical_variant_id WHERE sp.user_id=$1::uuid ORDER BY sp.saved_at DESC`,[uid]);
    const savedVendors=await tx.query<SqlRow>(`SELECT sv.public_id,v.public_id AS vendor_public_id,sv.saved_at
      FROM saved_vendors sv JOIN vendor_businesses v ON v.id=sv.vendor_id WHERE sv.user_id=$1::uuid ORDER BY sv.saved_at DESC`,[uid]);
    const recent=await tx.query<SqlRow>(`SELECT rv.public_id,cv.public_id AS canonical_variant_public_id,rv.viewed_at,rv.expires_at
      FROM recently_viewed_products rv JOIN canonical_variants cv ON cv.id=rv.canonical_variant_id WHERE rv.user_id=$1::uuid ORDER BY rv.viewed_at DESC`,[uid]);
    const searches=await tx.query<SqlRow>(`SELECT public_id,name,query,alerts_enabled,seen_canonical_public_ids,last_observed_count,last_observed_at,created_at,updated_at
      FROM saved_searches WHERE user_id=$1::uuid ORDER BY created_at DESC`,[uid]);

    const notifications=await tx.query<SqlRow>(`SELECT public_id,channel,purpose,event_type,locale,title,body,payload,status,sent_at,failed_at,read_at,archived_at,created_at
      FROM notifications WHERE user_id=$1::uuid ORDER BY created_at DESC`,[uid]);

    const sessions=await tx.query<SqlRow>(`SELECT public_id,expires_at,last_seen_at,created_at FROM user_sessions WHERE user_id=$1::uuid ORDER BY created_at DESC`,[uid]);

    const deliveryJobs=await tx.query<SqlRow>(`SELECT dj.public_id,o.public_id AS order_public_id,dj.job_type,dj.status,dj.live_tracking_enabled,dj.assigned_at,dj.started_at,dj.completed_at,
      dj.cancelled_at,dj.service_level,dj.promised_by,dj.package_count,dj.created_at,dj.updated_at
      FROM delivery_jobs dj JOIN customer_orders o ON o.id=dj.order_id WHERE o.user_id=$1::uuid ORDER BY dj.created_at DESC`,[uid]);

    const deliveryEvents=await tx.query<SqlRow>(`SELECT de.public_id,dj.public_id AS delivery_job_public_id,de.event_type,de.actor_type,de.message,de.metadata,de.occurred_at
      FROM delivery_events de JOIN delivery_jobs dj ON dj.id=de.job_id JOIN customer_orders o ON o.id=dj.order_id
      WHERE o.user_id=$1::uuid AND de.customer_visible=true ORDER BY de.occurred_at ASC`,[uid]);

    const privacy=await tx.query<SqlRow>(`SELECT public_id,reference_number,request_type,status,due_at,details,retention_snapshot,outcome,processing_started_at,completed_at,created_at
      FROM privacy_requests WHERE user_id=$1::uuid ORDER BY created_at DESC`,[uid]);

    const support=await tx.query<SqlRow>(`SELECT public_id,reference_number,subject,category,priority,status,context_type,context_public_id,created_at,updated_at,resolved_at
      FROM customer_support_cases WHERE customer_user_id=$1::uuid ORDER BY created_at DESC`,[uid]);
    const supportMessages=await tx.query<SqlRow>(`SELECT sc.reference_number,e.event_type,e.note,e.actor_public_id,e.created_at
      FROM customer_support_case_events e JOIN customer_support_cases sc ON sc.id=e.case_id
      WHERE sc.customer_user_id=$1::uuid AND e.customer_visible=true ORDER BY e.created_at ASC`,[uid]);

    const map=(rows:readonly SqlRow[])=>rows.map(plainRow);
    const counts={
      addresses:addresses.rowCount,orders:orders.rowCount,orderLines:orderLines.rowCount,payments:payments.rowCount,refunds:refunds.rowCount,paymentDisputes:paymentDisputes.rowCount,
      returns:returns.rowCount,askLocalRequests:askLocal.rowCount,privateOffers:privateOffers.rowCount,conversations:conversations.rowCount,messages:messages.rowCount,
      giftCards:giftCards.rowCount,giftCardLedger:giftLedger.rowCount,savedProducts:savedProducts.rowCount,savedVendors:savedVendors.rowCount,recentlyViewed:recent.rowCount,
      savedSearches:searches.rowCount,notifications:notifications.rowCount,sessions:sessions.rowCount,deliveryJobs:deliveryJobs.rowCount,deliveryEvents:deliveryEvents.rowCount,
      privacyRequests:privacy.rowCount,supportCases:support.rowCount,customerVisibleSupportMessages:supportMessages.rowCount
    };

    return {
      exportVersion:"2.0",
      generatedAt:Date.now(),
      subject:{
        userId:text(row.public_id),email:text(row.email),status:text(row.status),firstName:optional(row.first_name),lastName:optional(row.last_name),phone:optional(row.phone),
        preferredLocale:optional(row.preferred_locale),emailVerifiedAt:iso(row.email_verified_at),accountCreatedAt:iso(row.created_at),accountUpdatedAt:iso(row.updated_at),
        marketingConsent:Boolean(row.marketing_consent),recommendationsEnabled:Boolean(row.recommendations_enabled),recentlyViewedEnabled:Boolean(row.recently_viewed_enabled)
      },
      addresses:map(addresses.rows),orders:map(orders.rows),orderLines:map(orderLines.rows),payments:map(payments.rows),refunds:map(refunds.rows),paymentDisputes:map(paymentDisputes.rows),
      returns:map(returns.rows),askLocalRequests:map(askLocal.rows),privateOffers:map(privateOffers.rows),conversations:map(conversations.rows),messages:map(messages.rows),
      giftCards:map(giftCards.rows),giftCardLedger:map(giftLedger.rows),savedProducts:map(savedProducts.rows),savedVendors:map(savedVendors.rows),recentlyViewed:map(recent.rows),
      savedSearches:map(searches.rows),notifications:map(notifications.rows),sessions:map(sessions.rows),deliveryJobs:map(deliveryJobs.rows),deliveryEvents:map(deliveryEvents.rows),
      privacyRequests:map(privacy.rows),supportCases:map(support.rows),customerVisibleSupportMessages:map(supportMessages.rows),counts
    };
  },{readOnly:true});
}

export async function buildAdminPrivacyReportSnapshot(principal:SessionPrincipal,userId:string){
  assertAdminPermission(principal,"privacy.read");
  const snapshot=await buildPrivacyReportSnapshot(principal.userId,userId);
  await recordAdminPersonalDataAccess(principal,{
    eventType:"personal_data.exported",route:"/api/admin/privacy/report",resourceType:"customer_privacy_report",resourceId:userId,purpose:"privacy_operations",
    dataClasses:["identity","contact","addresses","orders","payments","returns","ask_local","messages","gift_cards","saved_data","notifications","sessions","delivery","privacy_requests","customer_visible_support"],
    recordCount:Object.values(snapshot.counts).reduce((sum,value)=>sum+value,1),accessScope:"individual"
  });
  return snapshot;
}

function short(value:unknown,max=80):string{
  const raw=typeof value==="string"?value:JSON.stringify(value??"");
  return raw.length<=max?raw:`${raw.slice(0,max-1)}…`;
}

export async function renderPrivacyReportPdf(snapshot:PrivacyReportSnapshot,requestReference:string):Promise<Buffer>{
  const printerModule=await import("pdfmake");
  const fontsModule=await import("pdfmake/build/vfs_fonts");
  const PdfPrinter=(printerModule.default??printerModule) as any;
  const raw=(fontsModule.default??fontsModule) as any;
  const vfs=(raw.pdfMake?.vfs??raw) as Record<string,string>;
  const font=(name:string)=>{const value=vfs[name];if(typeof value!=="string")throw new Error(`Embedded PDF font missing: ${name}`);return Buffer.from(value,"base64");};
  const printer=new PdfPrinter({Roboto:{normal:font("Roboto-Regular.ttf"),bold:font("Roboto-Medium.ttf"),italics:font("Roboto-Italic.ttf"),bolditalics:font("Roboto-MediumItalic.ttf")}});
  const money=(minor:unknown,currency:unknown)=>{const n=Number(minor);return Number.isFinite(n)?new Intl.NumberFormat("el-GR",{style:"currency",currency:typeof currency==="string"?currency:"EUR"}).format(n/100):"—";};
  const countRows=Object.entries(snapshot.counts).map(([key,value])=>[key,String(value)]);
  const doc={
    pageSize:"A4",
    pageMargins:[42,48,42,52],
    defaultStyle:{font:"Roboto",fontSize:9,color:"#20332a",lineHeight:1.2},
    styles:{h1:{fontSize:21,bold:true,color:"#183027",margin:[0,0,0,8]},h2:{fontSize:13,bold:true,color:"#183027",margin:[0,14,0,6]},muted:{fontSize:8,color:"#617067"},small:{fontSize:7,color:"#617067"}},
    footer:(currentPage:number,pageCount:number)=>({text:`ΚΟΝΤΑ ΜΟΥ · GDPR report · ${currentPage}/${pageCount}`,alignment:"center",style:"small",margin:[0,12,0,0]}),
    content:[
      {text:"ΚΟΝΤΑ ΜΟΥ · GDPR DATA REPORT",style:"muted"},
      {text:"Αναφορά προσωπικών δεδομένων",style:"h1"},
      {text:`Αίτημα: ${requestReference} · Export v${snapshot.exportVersion} · Δημιουργήθηκε: ${new Date(snapshot.generatedAt).toLocaleString("el-GR")}`,style:"small"},
      {text:"Στοιχεία υποκειμένου",style:"h2"},
      {table:{widths:["32%","68%"],body:[
        ["User ID",snapshot.subject.userId],["Email",snapshot.subject.email],["Κατάσταση λογαριασμού",snapshot.subject.status],
        ["Ονοματεπώνυμο",[snapshot.subject.firstName,snapshot.subject.lastName].filter(Boolean).join(" ")||"—"],["Τηλέφωνο",snapshot.subject.phone||"—"],
        ["Γλώσσα",snapshot.subject.preferredLocale||"—"],["Email verified",snapshot.subject.emailVerifiedAt||"—"],["Account created",snapshot.subject.accountCreatedAt||"—"]
      ]},layout:"lightHorizontalLines"},
      {text:"Ρυθμίσεις λογαριασμού",style:"h2"},
      {ul:[`Marketing consent: ${snapshot.subject.marketingConsent?"ON":"OFF"}`,`Recommendations: ${snapshot.subject.recommendationsEnabled?"ON":"OFF"}`,`Recently viewed: ${snapshot.subject.recentlyViewedEnabled?"ON":"OFF"}`]},
      {text:"Περιεχόμενο εξαγωγής",style:"h2"},
      {table:{widths:["70%","30%"],body:[["Κατηγορία","Records"],...countRows]},layout:"lightHorizontalLines"},
      {text:"Διευθύνσεις",style:"h2"},
      snapshot.addresses.length?{table:{headerRows:1,widths:["20%","35%","20%","25%"],body:[
        ["Label / recipient","Address","City / postcode","Country"],
        ...snapshot.addresses.map((a)=>[`${a.label??""} ${a.recipient_name??""}`.trim()||"—",short(`${a.line1??""} ${a.line2??""}`.trim(),100),`${a.locality??""} ${a.postcode??""}`.trim(),String(a.country_code??"")])
      ]},layout:"lightHorizontalLines"}:{text:"Δεν υπάρχουν αποθηκευμένες διευθύνσεις.",style:"muted"},
      {text:"Παραγγελίες",style:"h2"},
      snapshot.orders.length?{table:{headerRows:1,widths:["24%","18%","20%","18%","20%"],body:[
        ["Order","Status","Fulfilment","Total","Created"],
        ...snapshot.orders.map((o)=>[String(o.order_number??o.public_id??""),String(o.status??""),String(o.fulfilment_preference??""),money(o.total_minor,o.currency),String(o.created_at??"")])
      ]},layout:"lightHorizontalLines"}:{text:"Δεν υπάρχουν παραγγελίες.",style:"muted"},
      {text:"Ask Local & ιδιωτικές προσφορές",style:"h2"},
      snapshot.askLocalRequests.length?{table:{headerRows:1,widths:["26%","18%","18%","38%"],body:[
        ["Reference","Status","Created","Request context"],
        ...snapshot.askLocalRequests.map((a)=>[String(a.reference_number??a.public_id??""),String(a.status??""),String(a.created_at??""),short(a.source_metadata,120)])
      ]},layout:"lightHorizontalLines"}:{text:"Δεν υπάρχουν Ask Local αιτήματα.",style:"muted"},
      snapshot.privateOffers.length?{text:`Ιδιωτικές προσφορές: ${snapshot.privateOffers.length}`,style:"small"}:null,
      {text:"Επιστροφές & πληρωμές",style:"h2"},
      {text:`Payments: ${snapshot.payments.length} · Refunds: ${snapshot.refunds.length} · Disputes: ${snapshot.paymentDisputes.length} · Returns: ${snapshot.returns.length}`},
      snapshot.returns.length?{table:{headerRows:1,widths:["24%","20%","20%","36%"],body:[
        ["Return","Status","Remedy","Reason"],
        ...snapshot.returns.map((r)=>[String(r.return_number??r.public_id??""),String(r.status??""),String(r.requested_remedy??r.approved_remedy??""),short(r.reason_type,100)])
      ]},layout:"lightHorizontalLines"}:null,
      {text:"Συνομιλίες & υποστήριξη",style:"h2"},
      {text:`Conversations: ${snapshot.conversations.length} · Messages: ${snapshot.messages.length} · Support cases: ${snapshot.supportCases.length} · Customer-visible support messages: ${snapshot.customerVisibleSupportMessages.length}`},
      snapshot.messages.length?{table:{headerRows:1,widths:["24%","16%","42%","18%"],body:[
        ["Conversation","Sender","Message","Created"],
        ...snapshot.messages.map((m)=>[String(m.conversation_public_id??""),String(m.sender_role??m.sender_type??""),short(m.body,160),String(m.created_at??"")])
      ]},layout:"lightHorizontalLines"}:null,
      {text:"Gift Cards, saved data & delivery",style:"h2"},
      {text:`Gift Cards: ${snapshot.giftCards.length} · Ledger entries: ${snapshot.giftCardLedger.length} · Saved products: ${snapshot.savedProducts.length} · Saved vendors: ${snapshot.savedVendors.length} · Saved searches: ${snapshot.savedSearches.length} · Recently viewed: ${snapshot.recentlyViewed.length} · Delivery jobs: ${snapshot.deliveryJobs.length}`},
      {text:"Αιτήματα ιδιωτικότητας",style:"h2"},
      snapshot.privacyRequests.length?{table:{headerRows:1,widths:["22%","22%","18%","38%"],body:[
        ["Reference","Type","Status","Created"],
        ...snapshot.privacyRequests.map((p)=>[String(p.reference_number??p.public_id??""),String(p.request_type??""),String(p.status??""),String(p.created_at??"")])
      ]},layout:"lightHorizontalLines"}:{text:"Δεν υπάρχουν άλλα αιτήματα.",style:"muted"},
      {text:"Σημείωση για την έκταση της αναφοράς",style:"h2"},
      {text:"Το PDF είναι αναγνώσιμη αναφορά των βασικών δεδομένων και κατηγοριών. Η συνοδευτική JSON εξαγωγή είναι το πλήρες δομημένο πακέτο των records που ανακτήθηκαν από τα ενεργά customer-facing συστήματα για αυτόν τον λογαριασμό. Εσωτερικά μυστικά ασφαλείας, password/session hashes και μη customer-facing στοιχεία τρίτων δεν περιλαμβάνονται. Υποχρεωτικά φορολογικά, λογιστικά, ασφάλειας ή dispute records μπορεί να υπόκεινται σε διαφορετικούς χρόνους διατήρησης.",style:"muted"}
    ].filter(Boolean)
  } as any;
  const pdf=printer.createPdfKitDocument(doc);
  const chunks:Buffer[]=[];
  return await new Promise<Buffer>((resolve,reject)=>{pdf.on("data",(chunk:Buffer)=>chunks.push(Buffer.from(chunk)));pdf.on("end",()=>resolve(Buffer.concat(chunks)));pdf.on("error",reject);pdf.end();});
}

export function privacyReportJson(snapshot:PrivacyReportSnapshot):string{return JSON.stringify(snapshot,null,2);}
