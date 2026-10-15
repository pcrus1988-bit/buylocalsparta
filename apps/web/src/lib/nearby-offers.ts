import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type NearbyOffer = {
  id: string; vendorName: string; locationName: string; locality: string;
  title: string; description: string; redemptionCode: string | null;
  distanceM: number; expiresAt: string; notify: boolean;
};
type Coordinates = { latitude: number; longitude: number; accuracy: number };

function unit() { return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 3500, lockTimeoutMs: 1000 }); }
function context(principal: SessionPrincipal) { return { platformAccess: true as const, requestId: `nearby-offers:${principal.userId}:${randomUUID()}` }; }

export function validCoordinates(p: Coordinates): boolean {
  return Number.isFinite(p.latitude) && p.latitude >= -90 && p.latitude <= 90
    && Number.isFinite(p.longitude) && p.longitude >= -180 && p.longitude <= 180
    && Number.isFinite(p.accuracy) && p.accuracy >= 0 && p.accuracy <= 200;
}
export async function getNearbyPreference(principal: SessionPrincipal) {
  return unit().withTransaction(context(principal), async tx => {
    const q = await tx.query<SqlRow>(`
      select coalesce(p.enabled,false) as enabled, coalesce(p.phone_notifications,false) as phone_notifications
      from public.users u left join public.nearby_offer_preferences p on p.user_id=u.id
      where (u.public_id=$1 or u.id::text=$1) limit 1
    `, [principal.userId]);
    if (!q.rows.length) throw new Error("ACCOUNT_NOT_FOUND");
    return { enabled: q.rows[0].enabled === true, phoneNotifications: q.rows[0].phone_notifications === true };
  }, { readOnly: true });
}
export async function setNearbyPreference(principal: SessionPrincipal, enabled: boolean, phoneNotifications: boolean) {
  return unit().withTransaction(context(principal), async tx => {
    const user = await tx.query<SqlRow>("select id from public.users where (public_id=$1 or id::text=$1) and status='active' limit 1", [principal.userId]);
    if (!user.rows.length) throw new Error("ACCOUNT_NOT_FOUND");
    const userId = user.rows[0].id;
    await tx.query(`
      insert into public.nearby_offer_preferences(user_id,enabled,phone_notifications,decided_at,updated_at)
      values($1,$2,$3,now(),now())
      on conflict(user_id) do update set enabled=excluded.enabled,phone_notifications=excluded.phone_notifications,updated_at=now(),decided_at=now()
    `, [userId, enabled, enabled && phoneNotifications]);
    await tx.query(`
      insert into public.nearby_offer_consent_events(user_id,enabled,phone_notifications,consent_version)
      values($1,$2,$3,'nearby-offers-v1')
    `, [userId, enabled, enabled && phoneNotifications]);
    return { enabled, phoneNotifications: enabled && phoneNotifications };
  });
}

export async function scanNearbyOffers(principal: SessionPrincipal, position: Coordinates & { canNotify: boolean }): Promise<NearbyOffer[]> {
  if (!validCoordinates(position)) throw new Error("LOCATION_NOT_ACCURATE");
  return unit().withTransaction(context(principal), async tx => {
    const pref = await tx.query<SqlRow>(`
      select u.id::text as user_id, p.enabled, p.phone_notifications
      from public.users u join public.nearby_offer_preferences p on p.user_id=u.id
      where (u.public_id=$1 or u.id::text=$1) and u.status='active'
      limit 1
    `, [principal.userId]);
    const p = pref.rows[0];
    if (p?.enabled !== true) return [];

    // Serialized per user across devices/serverless instances. Coordinates are used
    // only inside this short transaction; no tracking history is written to disk.
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1::text,0))", [`nearby:${p.user_id}`]);
    const result = await tx.query<SqlRow>(`
      select c.id::text, c.vendor_id::text, c.title, c.description, c.redemption_code,
        c.ends_at, coalesce(nullif(vb.trading_name,''),vb.legal_name) as vendor_name,
        vl.name as location_name, vl.locality,
        round(ST_Distance(vl.coordinates,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography))::integer as distance_m
      from public.nearby_offer_campaigns c
      join public.vendor_locations vl on vl.id=c.location_id and vl.vendor_id=c.vendor_id
      join public.vendor_businesses vb on vb.id=c.vendor_id
      where c.status='active' and now() between c.starts_at and c.ends_at
        and vl.active and vl.verified_at is not null and vl.coordinates is not null
        and vb.status='active' and vb.public_directory_visible=true
        and ST_DWithin(vl.coordinates, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, c.radius_m)
      order by distance_m asc, c.ends_at asc
      limit 20
    `, [p.user_id, position.longitude, position.latitude]);
    const candidates = result.rows;
    if (!candidates.length) return [];

    // Global max two alerts/24h, one per merchant/24h, one per campaign/7d.
    const deliveries = await tx.query<SqlRow>(`
      select vendor_id::text, campaign_id::text, notified_at
        from public.nearby_offer_delivery_log
       where user_id=$1::uuid and notified_at > now() - interval '7 days'
       order by notified_at desc limit 100
    `, [p.user_id]);
    const prev = deliveries.rows.map(d => ({
      vendorId: String(d.vendor_id), campaignId: String(d.campaign_id),
      time: new Date(String(d.notified_at)).getTime()
    }));
    const now = Date.now();
    let recentCount = prev.filter(d => now-d.time < 86400000).length;
    const delivered = new Set<string>();
    const output: NearbyOffer[] = [];
    for (const row of candidates) {
      const id = String(row.id), vendorId = String(row.vendor_id);
      const suppressed = recentCount >= 2
        || prev.some(d => d.vendorId===vendorId && now-d.time<86400000)
        || prev.some(d => d.campaignId===id && now-d.time<7*86400000)
        || delivered.has(vendorId);
      const notify = p.phone_notifications === true && position.canNotify === true && !suppressed;
      if (notify) {
        await tx.query(`
          insert into public.nearby_offer_delivery_log(user_id,campaign_id,vendor_id,notified_at,expires_at)
          values($1::uuid,$2::uuid,$3::uuid,now(),now()+interval '30 days')
        `, [p.user_id, id, vendorId]);
        recentCount++; delivered.add(vendorId);
      }
      output.push({
        id, vendorName:String(row.vendor_name), locationName:String(row.location_name),
        locality:String(row.locality ?? ""), title:String(row.title), description:String(row.description),
        redemptionCode:row.redemption_code ? String(row.redemption_code) : null,
        distanceM:Number(row.distance_m), expiresAt:new Date(String(row.ends_at)).toISOString(), notify
      });
    }
    return output;
  });
}

export async function vendorNearbyDashboard(principal: SessionPrincipal) {
  if (!principal.vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
  return unit().withTransaction(context(principal), async tx => {
    const locations = await tx.query<SqlRow>(`
      select l.id::text, l.name, l.locality, (l.active and l.verified_at is not null and l.coordinates is not null and v.status='active' and v.public_directory_visible=true) as eligible
      from public.vendor_locations l join public.vendor_businesses v on v.id=l.vendor_id
      where v.public_id=$1 order by l.is_primary desc, l.name
    `, [principal.vendorId]);
    const offers = await tx.query<SqlRow>(`
      select c.id::text, c.location_id::text, c.title,c.description,c.redemption_code,c.radius_m,
        c.starts_at,c.ends_at,c.status, c.created_at
      from public.nearby_offer_campaigns c join public.vendor_businesses v on v.id=c.vendor_id
      where v.public_id=$1 order by c.created_at desc limit 100
    `, [principal.vendorId]);
    return { locations: locations.rows, offers: offers.rows };
  }, { readOnly:true });
}
export async function createNearbyCampaign(principal: SessionPrincipal, body: Record<string, unknown>) {
  if (!principal.vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
  const title = String(body.title ?? "").trim(), description = String(body.description ?? "").trim();
  const locationId = String(body.locationId ?? ""), code = String(body.redemptionCode ?? "").trim();
  const radius = Number(body.radiusM ?? 200);
  const start = new Date(String(body.startsAt ?? "")), end = new Date(String(body.endsAt ?? ""));
  if (title.length<6 || title.length>110 || description.length<10 || description.length>500
    || (code && !/^[A-Za-z0-9_-]{3,32}$/.test(code))
    || !Number.isInteger(radius) || radius<100 || radius>500 || !Number.isFinite(start.getTime())
    || !Number.isFinite(end.getTime()) || start.getTime()<Date.now()-300000
    || end.getTime()<=start.getTime() || end.getTime()>start.getTime()+30*86400000) throw new Error("INVALID_OFFER");
  return unit().withTransaction(context(principal), async tx => {
    const inserted=await tx.query<SqlRow>(`
      insert into public.nearby_offer_campaigns(vendor_id,location_id,title,description,redemption_code,radius_m,starts_at,ends_at,status)
      select v.id,l.id,$3,$4,$5,$6,$7,$8,'draft'
        from public.vendor_businesses v join public.vendor_locations l on l.vendor_id=v.id
       where v.public_id=$1 and l.id::text=$2 and l.active and l.verified_at is not null and l.coordinates is not null
         and v.status='active' and v.public_directory_visible=true
      returning id::text
    `, [principal.vendorId,locationId,title,description,code||null,radius,start,end]);
    if (!inserted.rows[0]) throw new Error("LOCATION_NOT_VERIFIED");
    return { id:String(inserted.rows[0].id), status:"draft" };
  });
}
export async function setNearbyCampaignStatus(principal: SessionPrincipal, id: string, status: string) {
  if (!principal.vendorId || !/^[0-9a-f-]{36}$/i.test(id) || !["active","paused","draft"].includes(status)) throw new Error("INVALID_OFFER");
  return unit().withTransaction(context(principal), async tx => {
    const q=await tx.query<SqlRow>(`
      update public.nearby_offer_campaigns c set status=$3,updated_at=now()
      from public.vendor_businesses v, public.vendor_locations l
      where c.id::text=$2 and v.public_id=$1 and c.vendor_id=v.id
        and l.id=c.location_id and l.vendor_id=v.id
        and ( $3 <> 'active' or (
          v.status='active' and v.public_directory_visible=true and l.active
          and l.verified_at is not null and l.coordinates is not null
          and now() < c.ends_at ))
      returning c.id::text,c.status
    `, [principal.vendorId,id,status]);
    if (!q.rows[0]) throw new Error("OFFER_NOT_AVAILABLE");
    return {id:String(q.rows[0].id),status:String(q.rows[0].status)};
  });
}
