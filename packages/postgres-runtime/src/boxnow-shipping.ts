import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, id, type SessionPrincipal, type SqlExecutor, type SqlPool, type SqlRow } from "@buy-local-sparta/core";
import { BoxNowApiError, BoxNowClient, type BoxNowDeliveryResult, type BoxNowWebhookParcelEvent } from "@buy-local-sparta/boxnow-shipping";

function text(value: unknown, label: string): string { if (typeof value !== "string" || !value) throw new Error(`Invalid ${label}`); return value; }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function int(value: unknown, label: string): number { const n=Number(value); if(!Number.isSafeInteger(n)) throw new Error(`Invalid ${label}`); return n; }
function euroMajor(minor: number): string { if(!Number.isSafeInteger(minor)||minor<0) throw new Error("Invalid minor amount"); return (minor/100).toFixed(2); }
function vendorId(principal: SessionPrincipal): string { const id=principal.vendorId?.trim(); if(!id) throw new Error("Vendor session is not scoped to a business"); return id; }
function requestHash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export type BoxNowShipmentWorkspace = Readonly<{
  csrfToken: string;
  configured: boolean;
  shipments: readonly Readonly<{
    id: string;
    fulfilmentId: string;
    orderId: string;
    orderNumber: string;
    status: string;
    providerCreationState: string;
    trackingNumber?: string;
    providerReferenceNumber?: string;
    parcelIds: readonly string[];
    destinationLockerId?: string;
    destinationLabel?: string;
    canCreate: boolean;
    canHandover: boolean;
    manualReview: boolean;
    error?: string;
  }>[];
}>;

export class PostgresBoxNowShippingService {
  readonly #uow: PostgresUnitOfWork;
  readonly #client: BoxNowClient;
  constructor(pool: SqlPool, client: BoxNowClient) { this.#uow=new PostgresUnitOfWork(pool); this.#client=client; }

  async readiness(): Promise<{ok:boolean;message:string}> { try { await this.#client.readiness(); return {ok:true,message:"BOX NOW Partner API is reachable"}; } catch(error){ return {ok:false,message:error instanceof Error?error.message:String(error)}; } }

  async configureOrigin(input:{actorUserId:string;vendorLocationId:string;providerLocationId:string}):Promise<void>{
    await this.#uow.withTransaction({actorUserId:input.actorUserId,platformAccess:true,marketId:"sparta"},async(tx)=>{
      const actor=await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1",[input.actorUserId]); if(!actor.rowCount) throw new Error("Admin user not found");
      const location=await tx.query<SqlRow>("SELECT id::text AS id FROM vendor_locations WHERE public_id=$1 OR id::text=$1",[input.vendorLocationId]); if(!location.rowCount) throw new Error("Vendor location not found");
      await tx.query(`INSERT INTO shipping_provider_locations(id,vendor_location_id,provider,provider_location_id,active,configured_by,created_at,updated_at)
        VALUES($1,$2,'boxnow',$3,true,$4,now(),now()) ON CONFLICT(vendor_location_id,provider) DO UPDATE SET provider_location_id=EXCLUDED.provider_location_id,active=true,configured_by=EXCLUDED.configured_by,updated_at=now()`,[randomUUID(),text(location.rows[0].id,"location"),input.providerLocationId.trim(),text(actor.rows[0].id,"actor")]);
    });
  }

  async adminOrigins(actorUserId:string):Promise<readonly Readonly<{vendorId:string;vendorName:string;locationId:string;locationName:string;postcode:string;providerLocationId?:string}>[]>{
    return this.#uow.withTransaction({actorUserId,platformAccess:true,marketId:"sparta"},async(tx)=>{
      const rows=await tx.query<SqlRow>(`SELECT vb.public_id AS vendor_id,vb.trading_name AS vendor_name,vl.public_id AS location_id,vl.name AS location_name,vl.postcode,spl.provider_location_id
        FROM vendor_locations vl JOIN vendor_businesses vb ON vb.id=vl.vendor_id LEFT JOIN shipping_provider_locations spl ON spl.vendor_location_id=vl.id AND spl.provider='boxnow' AND spl.active
        WHERE vl.active ORDER BY vb.trading_name,vl.name`);
      return rows.rows.map(r=>({vendorId:text(r.vendor_id,"vendor_id"),vendorName:text(r.vendor_name,"vendor_name"),locationId:text(r.location_id,"location_id"),locationName:text(r.location_name,"location_name"),postcode:text(r.postcode,"postcode"),providerLocationId:optionalText(r.provider_location_id)}));
    },{readOnly:true});
  }

  async workspace(principal:SessionPrincipal):Promise<BoxNowShipmentWorkspace>{
    const vid=vendorId(principal);
    return this.#uow.withTransaction({actorUserId:principal.userId,vendorId:vid,marketId:"sparta"},async(tx)=>{
      const rows=await tx.query<SqlRow>(`SELECT s.public_id AS shipment_id,fo.public_id AS fulfilment_id,co.public_id AS order_id,co.order_number,fo.status AS fulfilment_status,s.status,s.provider_creation_state,s.tracking_number,s.provider_reference_number,s.provider_parcel_ids,s.provider_last_error,
        co.shipping_address_snapshot->>'providerDestinationId' AS destination_locker_id,co.shipping_address_snapshot->>'providerDestinationLabel' AS destination_label
        FROM fulfilment_orders fo JOIN customer_orders co ON co.id=fo.order_id
        LEFT JOIN shipments s ON s.fulfilment_order_id=fo.id AND s.status<>'cancelled'
        WHERE fo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) AND fo.mode='shipping' ORDER BY fo.created_at DESC`,[vid]);
      const configured=Boolean((await tx.query<SqlRow>(`SELECT 1 AS hit FROM shipping_provider_locations spl JOIN vendor_locations vl ON vl.id=spl.vendor_location_id WHERE vl.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) AND spl.provider='boxnow' AND spl.active LIMIT 1`,[vid])).rowCount);
      return {csrfToken:principal.csrfToken,configured,shipments:rows.rows.map(r=>{
        const shipmentId=optionalText(r.shipment_id); const fulfilmentStatus=text(r.fulfilment_status,"fulfilment_status"); const status=optionalText(r.status)??"not_created"; const creation=optionalText(r.provider_creation_state)??"not_started";
        const parcelIds=Array.isArray(r.provider_parcel_ids)?r.provider_parcel_ids.map(String):[];
        return {id:shipmentId??`pending:${text(r.fulfilment_id,"fulfilment_id")}`,fulfilmentId:text(r.fulfilment_id,"fulfilment_id"),orderId:text(r.order_id,"order_id"),orderNumber:text(r.order_number,"order_number"),status,providerCreationState:creation,trackingNumber:optionalText(r.tracking_number),providerReferenceNumber:optionalText(r.provider_reference_number),parcelIds,destinationLockerId:optionalText(r.destination_locker_id),destinationLabel:optionalText(r.destination_label),canCreate:["accepted","picking","packed"].includes(fulfilmentStatus)&&(!shipmentId||["not_started","failed"].includes(creation)),canHandover:status==="label_ready",manualReview:creation==="manual_review",error:optionalText(r.provider_last_error)};
      })};
    },{readOnly:true});
  }

  async createOrReconcile(principal:SessionPrincipal,input:{fulfilmentId:string;now?:number}):Promise<BoxNowShipmentWorkspace>{
    const vid=vendorId(principal), now=input.now??Date.now();
    const prepared=await this.#uow.withTransaction({actorUserId:principal.userId,vendorId:vid,marketId:"sparta",platformAccess:true},async(tx)=>this.#prepare(tx,principal,input.fulfilmentId,now));
    let result:BoxNowDeliveryResult|undefined; let error:unknown;
    if(["creating","manual_review"].includes(prepared.previousCreationState)){
      try { result=await this.#client.reconcileDelivery(prepared.request.orderNumber); } catch(e){ error=e; }
      if(result){ await this.#confirm(prepared.shipmentId,result,now); return this.workspace(principal); }
      await this.#markManualReview(prepared.shipmentId, undefined, error instanceof Error?error.message:"BOX NOW delivery creation outcome is still unknown", now);
      throw new Error("BOX NOW delivery outcome is still unknown; automatic re-creation is blocked to prevent duplicate parcels");
    }
    try { result=await this.#client.createDelivery(prepared.request); }
    catch(e){ error=e; try { result=await this.#client.reconcileDelivery(prepared.request.orderNumber); } catch(reconcileError){ error=reconcileError; } }
    if(result){ await this.#confirm(prepared.shipmentId,result,now); return this.workspace(principal); }
    const code=error instanceof BoxNowApiError?error.code:undefined;
    await this.#markManualReview(prepared.shipmentId, code, error instanceof Error?error.message:String(error), now);
    throw new Error(`BOX NOW delivery outcome requires reconciliation${code?` (${code})`:""}`);
  }

  async processWebhook(event:BoxNowWebhookParcelEvent,receivedAt=Date.now()):Promise<{duplicate:boolean;stale:boolean;shipmentId?:string;status?:string}>{
    return this.#uow.withTransaction({platformAccess:true,marketId:"sparta"},async(tx)=>{
      const row=await tx.query<SqlRow>(`SELECT s.id::text AS shipment_uuid,s.public_id AS shipment_id,s.status,s.provider_state,fo.id::text AS fulfilment_uuid,fo.public_id AS fulfilment_id,fo.status::text AS fulfilment_status,co.id::text AS order_uuid,co.status::text AS order_status,s.vendor_id::text AS vendor_uuid
        FROM shipments s JOIN fulfilment_orders fo ON fo.id=s.fulfilment_order_id JOIN customer_orders co ON co.id=s.order_id
        WHERE s.carrier='boxnow' AND (s.provider_shipment_id=$1 OR s.provider_parcel_ids ? $1 OR ($2::text IS NOT NULL AND fo.public_id=$2))
        ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE OF s,fo,co`,[event.parcelId,event.orderNumber??null]);
      if(!row.rowCount) throw new Error("BOX NOW webhook shipment was not found");
      const r=row.rows[0], shipmentUuid=text(r.shipment_uuid,"shipment_uuid"), shipmentId=text(r.shipment_id,"shipment_id");
      const inserted=await tx.query<SqlRow>(`INSERT INTO shipment_provider_events(id,shipment_id,provider,provider_event_id,event_type,payload,received_at) VALUES($1,$2,'boxnow',$3,$4,$5::jsonb,$6)
        ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id::text AS id`,[randomUUID(),shipmentUuid,event.id,event.event,JSON.stringify(boxNowAuditPayload(event)),new Date(receivedAt)]);
      if(!inserted.rowCount) return {duplicate:true,stale:false,shipmentId,status:text(r.status,"shipment.status")};
      const state=r.provider_state&&typeof r.provider_state==="object"?r.provider_state as Record<string,unknown>:{};
      const latest=typeof state.latestEventTime==="string"?Date.parse(state.latestEventTime):Number(state.latestEventAt??0);
      if(Number.isFinite(latest)&&latest>0&&event.eventTime<=latest){
        await tx.query("UPDATE shipment_provider_events SET processed_at=$2 WHERE provider='boxnow' AND provider_event_id=$1",[event.id,new Date(receivedAt)]);
        return {duplicate:false,stale:true,shipmentId,status:text(r.status,"shipment.status")};
      }
      const mapped=boxNowShipmentTransition(event.event,text(r.status,"shipment.status"));
      const eventDate=new Date(event.eventTime), fulfilmentUuid=text(r.fulfilment_uuid,"fulfilment_uuid"), orderUuid=text(r.order_uuid,"order_uuid");
      const nextState={latestEventId:event.id,latestEvent:event.event,latestEventTime:new Date(event.eventTime).toISOString(),parcelId:event.parcelId,orderNumber:event.orderNumber,location:event.location};
      if(mapped.shipmentStatus){
        if(mapped.shipmentStatus==="in_transit") await tx.query(`UPDATE shipments SET status='in_transit',handed_over_at=COALESCE(handed_over_at,$2),shipped_at=COALESCE(shipped_at,$2),provider_state=provider_state||$3::jsonb,updated_at=$2 WHERE id=$1 AND status NOT IN ('delivered','returned','cancelled')`,[shipmentUuid,eventDate,JSON.stringify(nextState)]);
        else if(mapped.shipmentStatus==="delivered") await tx.query(`UPDATE shipments SET status='delivered',handed_over_at=COALESCE(handed_over_at,$2),shipped_at=COALESCE(shipped_at,$2),delivered_at=COALESCE(delivered_at,$2),provider_state=provider_state||$3::jsonb,updated_at=$2 WHERE id=$1`,[shipmentUuid,eventDate,JSON.stringify(nextState)]);
        else if(mapped.shipmentStatus==="cancelled") await tx.query(`UPDATE shipments SET status='cancelled',provider_creation_state='cancelled',provider_state=provider_state||$3::jsonb,updated_at=$2 WHERE id=$1 AND status NOT IN ('delivered','returned')`,[shipmentUuid,eventDate,JSON.stringify(nextState)]);
        else await tx.query(`UPDATE shipments SET status=$2,exception_reason=$3,provider_state=provider_state||$4::jsonb,updated_at=$5 WHERE id=$1 AND status NOT IN ('delivered','returned','cancelled')`,[shipmentUuid,mapped.shipmentStatus,mapped.reason??null,JSON.stringify(nextState),eventDate]);
      } else await tx.query(`UPDATE shipments SET provider_state=provider_state||$2::jsonb,updated_at=GREATEST(updated_at,$3) WHERE id=$1`,[shipmentUuid,JSON.stringify(nextState),eventDate]);

      if(mapped.fulfilmentStatus==="shipped"){
        await tx.query(`UPDATE fulfilment_orders SET status='shipped',updated_at=$2 WHERE id=$1 AND status IN ('accepted','picking','packed','ready_for_handover')`,[fulfilmentUuid,eventDate]);
        await tx.query(`UPDATE order_lines SET status='shipped' WHERE id IN (SELECT order_line_id FROM fulfilment_order_lines WHERE fulfilment_order_id=$1) AND status NOT IN ('fulfilled','refunded','cancelled')`,[fulfilmentUuid]);
      } else if(mapped.fulfilmentStatus==="delivered"){
        await tx.query(`UPDATE fulfilment_orders SET status='delivered',delivered_at=COALESCE(delivered_at,$2),updated_at=$2 WHERE id=$1 AND status<>'cancelled'`,[fulfilmentUuid,eventDate]);
        await tx.query(`UPDATE order_lines SET status='fulfilled',fulfilled_quantity=quantity,fulfilled_at=COALESCE(fulfilled_at,$2) WHERE id IN (SELECT order_line_id FROM fulfilment_order_lines WHERE fulfilment_order_id=$1) AND status<>'cancelled'`,[fulfilmentUuid,eventDate]);
        const remaining=await tx.query<SqlRow>(`SELECT count(*)::int AS n FROM fulfilment_orders WHERE order_id=$1 AND status NOT IN ('rejected','cancelled','delivered')`,[orderUuid]);
        await tx.query(`UPDATE customer_orders SET status=$2,updated_at=$3 WHERE id=$1 AND status NOT IN ('cancelled','refunded','disputed')`,[orderUuid,int(remaining.rows[0]?.n??0,"remaining fulfilments")===0?"fulfilled":"partially_fulfilled",eventDate]);
      }
      await tx.query(`INSERT INTO order_timeline_events(id,public_id,order_id,fulfilment_order_id,vendor_id,event_type,actor_type,customer_visible,message,metadata,created_at)
        VALUES($1,$2,$3,$4,$5,$6,'provider',true,$7,$8::jsonb,$9)`,[randomUUID(),id("timeline"),orderUuid,fulfilmentUuid,text(r.vendor_uuid,"vendor_uuid"),`boxnow.${event.event}`,boxNowCustomerMessage(event.event),JSON.stringify({provider:"boxnow",parcelId:event.parcelId,location:event.location}),eventDate]);
      await tx.query("UPDATE shipment_provider_events SET processed_at=$2 WHERE provider='boxnow' AND provider_event_id=$1",[event.id,new Date(receivedAt)]);
      return {duplicate:false,stale:false,shipmentId,status:mapped.shipmentStatus??text(r.status,"shipment.status")};
    },{isolation:"serializable"});
  }

  async labelPdf(principal:SessionPrincipal,shipmentId:string):Promise<Uint8Array>{
    const vid=vendorId(principal);
    const orderNumber=await this.#uow.withTransaction({actorUserId:principal.userId,vendorId:vid,marketId:"sparta"},async(tx)=>{
      const row=await tx.query<SqlRow>(`SELECT fo.public_id AS fulfilment_id FROM shipments s JOIN fulfilment_orders fo ON fo.id=s.fulfilment_order_id WHERE s.public_id=$1 AND s.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2) AND s.provider_creation_state='confirmed'`,[shipmentId,vid]);
      if(!row.rowCount) throw new Error("Shipment label access denied"); return text(row.rows[0].fulfilment_id,"fulfilment_id");
    },{readOnly:true});
    return this.#client.labelPdfForOrder(orderNumber);
  }

  async handover(principal:SessionPrincipal,shipmentId:string,now=Date.now()):Promise<BoxNowShipmentWorkspace>{
    const vid=vendorId(principal);
    await this.#uow.withTransaction({actorUserId:principal.userId,vendorId:vid,marketId:"sparta",platformAccess:true},async(tx)=>{
      const row=await tx.query<SqlRow>(`SELECT s.id::text AS shipment_uuid,s.status,fo.id::text AS fulfilment_uuid FROM shipments s JOIN fulfilment_orders fo ON fo.id=s.fulfilment_order_id WHERE s.public_id=$1 AND s.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2) FOR UPDATE OF s,fo`,[shipmentId,vid]);
      if(!row.rowCount) throw new Error("Shipment access denied"); if(text(row.rows[0].status,"status")!=="label_ready") throw new Error("Shipment must have a confirmed label before handover");
      await tx.query("UPDATE shipments SET status='handed_to_carrier',handed_over_at=$2,shipped_at=$2,updated_at=$2 WHERE id=$1",[text(row.rows[0].shipment_uuid,"shipment_uuid"),new Date(now)]);
      await tx.query("UPDATE fulfilment_orders SET status='shipped',updated_at=$2 WHERE id=$1",[text(row.rows[0].fulfilment_uuid,"fulfilment_uuid"),new Date(now)]);
      await tx.query(`UPDATE order_lines SET status='shipped' WHERE id IN (SELECT order_line_id FROM fulfilment_order_lines WHERE fulfilment_order_id=$1)`,[text(row.rows[0].fulfilment_uuid,"fulfilment_uuid")]);
    });
    return this.workspace(principal);
  }

  async #prepare(tx:SqlExecutor,principal:SessionPrincipal,fulfilmentId:string,now:number){
    const vid=vendorId(principal);
    const row=await tx.query<SqlRow>(`SELECT fo.id::text AS fulfilment_uuid,fo.public_id AS fulfilment_id,fo.status AS fulfilment_status,fo.location_id::text AS location_uuid,co.id::text AS order_uuid,co.public_id AS order_id,co.order_number,co.status AS order_status,co.total_minor,co.shipping_address_snapshot,
      vb.trading_name,vl.name AS location_name,vl.phone,vl.public_email,spl.provider_location_id
      FROM fulfilment_orders fo JOIN customer_orders co ON co.id=fo.order_id JOIN vendor_businesses vb ON vb.id=fo.vendor_id JOIN vendor_locations vl ON vl.id=fo.location_id
      LEFT JOIN shipping_provider_locations spl ON spl.vendor_location_id=vl.id AND spl.provider='boxnow' AND spl.active
      WHERE fo.public_id=$1 AND vb.public_id=$2 AND fo.mode='shipping' FOR UPDATE OF fo,co`,[fulfilmentId,vid]);
    if(!row.rowCount) throw new Error("Shipping fulfilment access denied"); const r=row.rows[0];
    if(!["confirmed","partially_fulfilled"].includes(text(r.order_status,"order_status"))) throw new Error("Order must be payment-confirmed before shipment creation");
    if(!["accepted","picking","packed"].includes(text(r.fulfilment_status,"fulfilment_status"))) throw new Error("Vendor must accept the fulfilment before creating shipment");
    const snapshot=r.shipping_address_snapshot&&typeof r.shipping_address_snapshot==="object"?r.shipping_address_snapshot as Record<string,unknown>:{};
    if(snapshot.provider!=="boxnow") throw new Error("Order does not contain a BOX NOW locker selection");
    const destinationId=text(snapshot.providerDestinationId,"providerDestinationId"), recipientName=text(snapshot.recipientName,"recipientName"), recipientEmail=text(snapshot.recipientEmail,"recipientEmail"), recipientPhone=text(snapshot.recipientPhone,"recipientPhone");
    const originId=text(r.provider_location_id,"BOX NOW origin mapping"); const vendorPhone=text(r.phone,"vendor location phone"), vendorEmail=text(r.public_email,"vendor location email");
    const fulfilmentUuid=text(r.fulfilment_uuid,"fulfilment_uuid"), orderUuid=text(r.order_uuid,"order_uuid");
    let shipment=await tx.query<SqlRow>("SELECT id::text AS id,public_id,provider_creation_state FROM shipments WHERE fulfilment_order_id=$1 AND status<>'cancelled' FOR UPDATE",[fulfilmentUuid]);
    if(shipment.rowCount&&text(shipment.rows[0].provider_creation_state,"provider_creation_state")==="confirmed") throw new Error("BOX NOW shipment is already confirmed");
    const previousCreationState=shipment.rowCount?text(shipment.rows[0].provider_creation_state,"provider_creation_state"):"not_started";
    const shipmentUuid=shipment.rowCount?text(shipment.rows[0].id,"shipment.id"):randomUUID(); const shipmentPublic=shipment.rowCount?text(shipment.rows[0].public_id,"shipment.public_id"):id("shipment");
    if(!shipment.rowCount) await tx.query(`INSERT INTO shipments(id,public_id,order_id,fulfilment_order_id,vendor_id,location_id,from_postcode,to_postcode,package_count,carrier,service,status,quoted_amount_minor,currency,provider_creation_state,created_at,updated_at)
      SELECT $1,$2,$3,$4,fo.vendor_id,fo.location_id,vl.postcode,COALESCE(co.shipping_address_snapshot->>'postcode','23100'),1,'boxnow','locker','created',fo.delivery_charge_minor,'EUR','not_started',$5,$5 FROM fulfilment_orders fo JOIN vendor_locations vl ON vl.id=fo.location_id JOIN customer_orders co ON co.id=fo.order_id WHERE fo.id=$4`,[shipmentUuid,shipmentPublic,orderUuid,fulfilmentUuid,new Date(now)]);
    const line=await tx.query<SqlRow>(`SELECT string_agg(COALESCE(ol.product_snapshot->>'title','Product'),' + ' ORDER BY ol.created_at) AS title,SUM(ol.retail_unit_price_minor*ol.quantity)::bigint AS value_minor FROM fulfilment_order_lines fol JOIN order_lines ol ON ol.id=fol.order_line_id WHERE fol.fulfilment_order_id=$1`,[fulfilmentUuid]);
    const valueMinor=int(line.rows[0]?.value_minor??0,"shipment merchandise value"); const request={orderNumber:fulfilmentId,invoiceValueMajor:euroMajor(valueMinor),allowReturn:true,origin:{contactName:text(r.location_name,"location_name")||text(r.trading_name,"trading_name"),contactNumber:vendorPhone,contactEmail:vendorEmail,locationId:originId},destination:{contactName:recipientName,contactNumber:recipientPhone,contactEmail:recipientEmail,locationId:destinationId},items:[{id:fulfilmentId,name:optionalText(line.rows[0]?.title)?.slice(0,120)||"Buy Local Sparta order",valueMajor:euroMajor(valueMinor),weightGrams:0}]};
    const hash=requestHash(request); const attemptKey=`boxnow:${fulfilmentId}`;
    if(!["creating","manual_review"].includes(previousCreationState)){
      await tx.query(`INSERT INTO shipment_provider_attempts(id,public_id,shipment_id,provider,attempt_key,request_hash,status,created_at,updated_at) VALUES($1,$2,$3,'boxnow',$4,$5,'creating',$6,$6)
        ON CONFLICT(provider,attempt_key) DO UPDATE SET shipment_id=EXCLUDED.shipment_id,request_hash=EXCLUDED.request_hash,status='creating',error_code=NULL,error_message=NULL,updated_at=EXCLUDED.updated_at`,[randomUUID(),id("spa"),shipmentUuid,attemptKey,hash,new Date(now)]);
      await tx.query("UPDATE shipments SET provider_creation_state='creating',provider_request_hash=$2,provider_last_error=NULL,provider_attempted_at=$3,updated_at=$3 WHERE id=$1",[shipmentUuid,hash,new Date(now)]);
    }
    return {shipmentId:shipmentPublic,request,previousCreationState};
  }

  async #confirm(shipmentId:string,result:BoxNowDeliveryResult,now:number):Promise<void>{
    await this.#uow.withTransaction({platformAccess:true,marketId:"sparta"},async(tx)=>{
      const row=await tx.query<SqlRow>("SELECT id::text AS id,fulfilment_order_id::text AS fulfilment_uuid FROM shipments WHERE public_id=$1 FOR UPDATE",[shipmentId]); if(!row.rowCount) throw new Error("Shipment disappeared during BOX NOW confirmation");
      const uuid=text(row.rows[0].id,"shipment.id"), fulfilUuid=text(row.rows[0].fulfilment_uuid,"fulfilment_uuid");
      await tx.query(`UPDATE shipments SET provider_reference_number=$2,provider_parcel_ids=$3::jsonb,provider_shipment_id=$4,tracking_number=$4,provider_creation_state='confirmed',provider_confirmed_at=$5,status='label_ready',provider_last_error=NULL,updated_at=$5 WHERE id=$1`,[uuid,result.referenceNumber,JSON.stringify(result.parcelIds),result.parcelIds[0],new Date(now)]);
      await tx.query(`UPDATE shipment_provider_attempts SET status='confirmed',provider_reference_number=$2,provider_parcel_ids=$3::jsonb,error_code=NULL,error_message=NULL,updated_at=$4 WHERE shipment_id=$1 AND provider='boxnow'`,[uuid,result.referenceNumber,JSON.stringify(result.parcelIds),new Date(now)]);
      await tx.query("UPDATE fulfilment_orders SET status=CASE WHEN status='accepted' THEN 'packed' ELSE status END,updated_at=$2 WHERE id=$1",[fulfilUuid,new Date(now)]);
    });
  }
  async #markManualReview(shipmentId:string,code:string|undefined,message:string,now:number):Promise<void>{
    await this.#uow.withTransaction({platformAccess:true,marketId:"sparta"},async(tx)=>{
      const row=await tx.query<SqlRow>("SELECT id::text AS id FROM shipments WHERE public_id=$1 FOR UPDATE",[shipmentId]); if(!row.rowCount)return; const uuid=text(row.rows[0].id,"shipment.id");
      await tx.query("UPDATE shipments SET provider_creation_state='manual_review',provider_last_error=$2,updated_at=$3 WHERE id=$1",[uuid,message.slice(0,1000),new Date(now)]);
      await tx.query("UPDATE shipment_provider_attempts SET status='manual_review',error_code=$2,error_message=$3,updated_at=$4 WHERE shipment_id=$1 AND provider='boxnow'",[uuid,code??null,message.slice(0,1000),new Date(now)]);
    });
  }
}

function boxNowShipmentTransition(event:string,current:string):{shipmentStatus?:"in_transit"|"delivered"|"exception"|"lost"|"returned"|"cancelled";fulfilmentStatus?:"shipped"|"delivered";reason?:string}{
  if(event==="delivered") return {shipmentStatus:"delivered",fulfilmentStatus:"delivered"};
  if(["accepted-to-locker","in-depot","final-destination"].includes(event)) return {shipmentStatus:"in_transit",fulfilmentStatus:"shipped"};
  if(event==="returned"||event==="expired") return {shipmentStatus:"returned",reason:event};
  if(event==="lost") return {shipmentStatus:"lost",reason:event};
  if(event==="missing") return {shipmentStatus:"exception",reason:event};
  if(event==="cancelled") return {shipmentStatus:"cancelled",reason:event};
  if(event==="accepted-for-return") return current==="delivered"?{}:{shipmentStatus:"in_transit",fulfilmentStatus:"shipped"};
  return {};
}
function boxNowCustomerMessage(event:string):string{
  const messages:Record<string,string>={new:"Η αποστολή καταχωρίστηκε στη BOX NOW.","accepted-to-locker":"Η BOX NOW παρέλαβε το δέμα και ξεκίνησε η μεταφορά.","in-depot":"Το δέμα βρίσκεται σε κέντρο διανομής BOX NOW.","final-destination":"Το δέμα βρίσκεται στη θυρίδα BOX NOW και είναι έτοιμο για παραλαβή.",delivered:"Το δέμα παραδόθηκε.",expired:"Η προθεσμία παραλαβής έληξε και το δέμα επιστρέφεται.",returned:"Το δέμα επιστράφηκε στον αποστολέα.",cancelled:"Η αποστολή BOX NOW ακυρώθηκε.",missing:"Η BOX NOW ανέφερε πρόβλημα παραλαβής του δέματος.",lost:"Η BOX NOW ανέφερε ότι το δέμα αναζητείται.","accepted-for-return":"Η επιστροφή παραλήφθηκε από τη BOX NOW."};
  return messages[event]??`Ενημέρωση BOX NOW: ${event}`;
}

function boxNowAuditPayload(event:BoxNowWebhookParcelEvent):Record<string,unknown>{return{parcelId:event.parcelId,event:event.event,eventTime:new Date(event.eventTime).toISOString(),orderNumber:event.orderNumber,parcelReferenceNumber:event.parcelReferenceNumber,parcelName:event.parcelName,location:event.location};}
