import { randomUUID } from "node:crypto";
import type { DeliveryZone, LocationTradingSchedule, OpeningInterval, ScheduleException } from "../fulfilment/availability.ts";
import type { FulfilmentCapacityRule, VendorLocationProfile } from "../fulfilment/capacity.ts";
import { PostgresUnitOfWork, requireSingleRow, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

async function resolveId(db: SqlExecutor, table: "markets" | "vendor_businesses" | "vendor_locations", publicId: string): Promise<string> {
  const publicColumn = table === "markets" ? "code" : "public_id";
  const result = await db.query<SqlRow>(`SELECT id::text AS id FROM ${table} WHERE ${publicColumn}=$1 OR id::text=$1`, [publicId]);
  return String(requireSingleRow(result, `${table} record ${publicId} was not found`).id);
}

function asNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label} from database`);
  return parsed;
}

function epoch(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error("Invalid availability timestamp from database");
  return parsed;
}

export class PostgresAvailabilityRepository {
  readonly #uow: PostgresUnitOfWork;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool);
  }

  async saveLocation(input: { scope: DatabaseScope; location: VendorLocationProfile }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.location.marketId, vendorId: input.location.vendorId, platformAccess: false }, async (tx) => {
      const marketId = await resolveId(tx, "markets", input.location.marketId);
      const vendorId = await resolveId(tx, "vendor_businesses", input.location.vendorId);
      if (input.location.primary) await tx.query("UPDATE vendor_locations SET is_primary=false WHERE vendor_id=$1 AND public_id<>$2", [vendorId, input.location.id]);
      await tx.query(`INSERT INTO vendor_locations
        (id,public_id,vendor_id,market_id,name,address_line1,locality,postcode,coordinates,active,is_primary,timezone,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $9::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($10,$9),4326)::geography END,$11,$12,$13,$14)
        ON CONFLICT (public_id) DO UPDATE SET name=EXCLUDED.name,address_line1=EXCLUDED.address_line1,locality=EXCLUDED.locality,postcode=EXCLUDED.postcode,coordinates=EXCLUDED.coordinates,active=EXCLUDED.active,is_primary=EXCLUDED.is_primary,timezone=EXCLUDED.timezone`,
        [randomUUID(), input.location.id, vendorId, marketId, input.location.name, input.location.addressLine1, input.location.locality, input.location.postcode, input.location.coordinates?.lat ?? null, input.location.coordinates?.lon ?? null, input.location.active, input.location.primary, input.location.timezone, new Date(input.location.createdAt)]);
    });
  }

  async listLocations(input: { scope: DatabaseScope; vendorId?: string }): Promise<readonly VendorLocationProfile[]> {
    return this.#uow.withTransaction(input.vendorId ? { ...input.scope, vendorId: input.vendorId, platformAccess: false } : { ...input.scope, platformAccess: true }, async (tx) => {
      const vendorId = input.vendorId ? await resolveId(tx, "vendor_businesses", input.vendorId) : null;
      const result = await tx.query<SqlRow>(`SELECT l.public_id,v.public_id AS vendor_public_id,m.code AS market_public_id,l.name,l.address_line1,l.locality,l.postcode,l.timezone,l.active,l.is_primary,l.created_at,
        CASE WHEN l.coordinates IS NULL THEN NULL ELSE ST_Y(l.coordinates::geometry) END AS lat,CASE WHEN l.coordinates IS NULL THEN NULL ELSE ST_X(l.coordinates::geometry) END AS lon
        FROM vendor_locations l JOIN vendor_businesses v ON v.id=l.vendor_id JOIN markets m ON m.id=l.market_id WHERE ($1::uuid IS NULL OR l.vendor_id=$1) ORDER BY l.is_primary DESC,l.name`, [vendorId]);
      return result.rows.map((row) => ({ id:String(row.public_id),vendorId:String(row.vendor_public_id),marketId:String(row.market_public_id),name:String(row.name),addressLine1:String(row.address_line1),locality:String(row.locality),postcode:String(row.postcode),timezone:String(row.timezone),coordinates: row.lat===null||row.lat===undefined?undefined:{lat:asNumber(row.lat,"latitude"),lon:asNumber(row.lon,"longitude")},active:Boolean(row.active),primary:Boolean(row.is_primary),createdAt:epoch(row.created_at)! }));
    }, { readOnly: true });
  }

  async saveCapacityRule(input: { scope: DatabaseScope; rule: FulfilmentCapacityRule }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, vendorId: input.rule.vendorId, platformAccess: false }, async (tx) => {
      const vendorId=await resolveId(tx,"vendor_businesses",input.rule.vendorId); const locationId=await resolveId(tx,"vendor_locations",input.rule.locationId);
      await tx.query(`INSERT INTO fulfilment_capacity_rules(id,public_id,vendor_id,location_id,mode,max_open_fulfilments,active,priority,starts_at,ends_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
        ON CONFLICT(public_id) DO UPDATE SET max_open_fulfilments=EXCLUDED.max_open_fulfilments,active=EXCLUDED.active,priority=EXCLUDED.priority,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,updated_at=now()`, [randomUUID(),input.rule.id,vendorId,locationId,input.rule.mode,input.rule.maxOpenFulfilments,input.rule.active,input.rule.priority,new Date(input.rule.startsAt),input.rule.endsAt?new Date(input.rule.endsAt):null]);
    });
  }

  async listCapacityRules(input: { scope: DatabaseScope; vendorId?: string; locationId?: string }): Promise<readonly FulfilmentCapacityRule[]> {
    return this.#uow.withTransaction(input.vendorId ? { ...input.scope, vendorId: input.vendorId, platformAccess:false } : { ...input.scope, platformAccess:true }, async (tx) => {
      const vendorId=input.vendorId?await resolveId(tx,"vendor_businesses",input.vendorId):null; const locationId=input.locationId?await resolveId(tx,"vendor_locations",input.locationId):null;
      const result=await tx.query<SqlRow>(`SELECT r.public_id,v.public_id AS vendor_public_id,l.public_id AS location_public_id,r.mode,r.max_open_fulfilments,r.active,r.priority,r.starts_at,r.ends_at FROM fulfilment_capacity_rules r JOIN vendor_businesses v ON v.id=r.vendor_id JOIN vendor_locations l ON l.id=r.location_id WHERE ($1::uuid IS NULL OR r.vendor_id=$1) AND ($2::uuid IS NULL OR r.location_id=$2) ORDER BY r.priority DESC,r.public_id`,[vendorId,locationId]);
      return result.rows.map((row)=>({id:String(row.public_id),vendorId:String(row.vendor_public_id),locationId:String(row.location_public_id),mode:String(row.mode) as FulfilmentCapacityRule["mode"],maxOpenFulfilments:asNumber(row.max_open_fulfilments,"max_open_fulfilments"),active:Boolean(row.active),priority:asNumber(row.priority,"priority"),startsAt:epoch(row.starts_at)!,endsAt:epoch(row.ends_at)}));
    },{readOnly:true});
  }

  async saveSchedule(input: { scope: DatabaseScope; vendorId: string; schedule: LocationTradingSchedule }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, vendorId: input.vendorId, platformAccess: false }, async (tx) => {
      const locationId = await resolveId(tx, "vendor_locations", input.schedule.locationId);
      await tx.query(`INSERT INTO vendor_location_calendars(location_id,timezone,version,updated_at)
        VALUES ($1,$2,1,now()) ON CONFLICT (location_id) DO UPDATE SET timezone=EXCLUDED.timezone,version=vendor_location_calendars.version+1,updated_at=now()`, [locationId, input.schedule.timezone]);
      await tx.query("DELETE FROM vendor_location_opening_intervals WHERE location_id=$1", [locationId]);
      for (const day of input.schedule.weekly) {
        for (const interval of day.intervals) {
          await tx.query(`INSERT INTO vendor_location_opening_intervals(id,public_id,location_id,weekday,opens_minute,closes_minute)
            VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), `hours-${randomUUID()}`, locationId, day.weekday, interval.opensMinute, interval.closesMinute]);
        }
      }
      await tx.query("DELETE FROM vendor_location_schedule_exceptions WHERE location_id=$1", [locationId]);
      for (const exception of input.schedule.exceptions ?? []) {
        const exceptionId = randomUUID();
        await tx.query(`INSERT INTO vendor_location_schedule_exceptions(id,public_id,location_id,local_date,closed,reason)
          VALUES ($1,$2,$3,$4,$5,$6)`, [exceptionId, `closure-${randomUUID()}`, locationId, exception.date, Boolean(exception.closed), exception.reason ?? null]);
        for (const interval of exception.intervals ?? []) {
          await tx.query(`INSERT INTO vendor_location_exception_intervals(id,public_id,exception_id,opens_minute,closes_minute)
            VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), `exception-hours-${randomUUID()}`, exceptionId, interval.opensMinute, interval.closesMinute]);
        }
      }
    });
  }

  async loadSchedule(input: { scope: DatabaseScope; locationId: string; vendorId?: string }): Promise<LocationTradingSchedule | undefined> {
    return this.#uow.withTransaction(input.vendorId ? { ...input.scope, vendorId: input.vendorId, platformAccess: false } : { ...input.scope, platformAccess: true }, async (tx) => {
      const locationId = await resolveId(tx, "vendor_locations", input.locationId);
      const calendar = await tx.query<SqlRow>("SELECT timezone FROM vendor_location_calendars WHERE location_id=$1", [locationId]);
      if (calendar.rowCount === 0) return undefined;
      const intervals = await tx.query<SqlRow>("SELECT weekday,opens_minute,closes_minute FROM vendor_location_opening_intervals WHERE location_id=$1 ORDER BY weekday,opens_minute", [locationId]);
      const exceptions = await tx.query<SqlRow>(`SELECT e.id::text AS exception_id,e.local_date::text,e.closed,e.reason,i.opens_minute,i.closes_minute
        FROM vendor_location_schedule_exceptions e LEFT JOIN vendor_location_exception_intervals i ON i.exception_id=e.id
        WHERE e.location_id=$1 ORDER BY e.local_date,i.opens_minute`, [locationId]);
      const weekly = Array.from({ length: 7 }, (_, weekday) => ({ weekday, intervals: [] as OpeningInterval[] }));
      for (const row of intervals.rows) weekly[asNumber(row.weekday, "weekday")].intervals.push({ opensMinute: asNumber(row.opens_minute, "opens_minute"), closesMinute: asNumber(row.closes_minute, "closes_minute") });
      const byException = new Map<string, ScheduleException & { intervals: OpeningInterval[] }>();
      for (const row of exceptions.rows) {
        const key = String(row.exception_id);
        let item = byException.get(key);
        if (!item) {
          item = { date: String(row.local_date).slice(0, 10), closed: Boolean(row.closed), reason: typeof row.reason === "string" ? row.reason : undefined, intervals: [] };
          byException.set(key, item);
        }
        if (row.opens_minute !== null && row.opens_minute !== undefined) item.intervals.push({ opensMinute: asNumber(row.opens_minute, "opens_minute"), closesMinute: asNumber(row.closes_minute, "closes_minute") });
      }
      return { locationId: input.locationId, timezone: String(calendar.rows[0].timezone), weekly, exceptions: [...byException.values()] };
    }, { readOnly: true });
  }

  async saveZone(input: { scope: DatabaseScope; zone: DeliveryZone }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, vendorId: input.zone.vendorId, marketId: input.zone.marketId, platformAccess: false }, async (tx) => {
      const marketId = await resolveId(tx, "markets", input.zone.marketId);
      const vendorId = await resolveId(tx, "vendor_businesses", input.zone.vendorId);
      const locationId = await resolveId(tx, "vendor_locations", input.zone.locationId);
      await tx.query(`INSERT INTO fulfilment_service_zones
        (id,public_id,market_id,vendor_id,location_id,mode,postcode_prefixes,center,radius_meters,active,priority,starts_at,ends_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($9,$8),4326)::geography END,$10,$11,$12,$13,$14,now())
        ON CONFLICT (public_id) DO UPDATE SET postcode_prefixes=EXCLUDED.postcode_prefixes,center=EXCLUDED.center,radius_meters=EXCLUDED.radius_meters,
          active=EXCLUDED.active,priority=EXCLUDED.priority,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,updated_at=now()`,
        [randomUUID(), input.zone.id, marketId, vendorId, locationId, input.zone.mode, input.zone.postcodePrefixes ?? [], input.zone.center?.lat ?? null, input.zone.center?.lon ?? null,
          input.zone.radiusKm ? Math.round(input.zone.radiusKm * 1000) : null, input.zone.active, input.zone.priority, new Date(input.zone.startsAt), input.zone.endsAt ? new Date(input.zone.endsAt) : null]);
    });
  }

  async deleteZone(input: { scope: DatabaseScope; vendorId: string; zoneId: string }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, vendorId: input.vendorId, platformAccess: false }, async (tx) => {
      await tx.query("DELETE FROM fulfilment_service_zones WHERE public_id=$1", [input.zoneId]);
    });
  }

  async listZones(input: { scope: DatabaseScope; vendorId?: string; locationId?: string }): Promise<readonly DeliveryZone[]> {
    return this.#uow.withTransaction(input.vendorId ? { ...input.scope, vendorId: input.vendorId, platformAccess: false } : { ...input.scope, platformAccess: true }, async (tx) => {
      const vendorId = input.vendorId ? await resolveId(tx, "vendor_businesses", input.vendorId) : null;
      const locationId = input.locationId ? await resolveId(tx, "vendor_locations", input.locationId) : null;
      const result = await tx.query<SqlRow>(`SELECT z.public_id,m.code AS market_public_id,v.public_id AS vendor_public_id,l.public_id AS location_public_id,z.mode,z.postcode_prefixes,
        CASE WHEN z.center IS NULL THEN NULL ELSE ST_Y(z.center::geometry) END AS lat,CASE WHEN z.center IS NULL THEN NULL ELSE ST_X(z.center::geometry) END AS lon,
        z.radius_meters,z.active,z.priority,z.starts_at,z.ends_at
        FROM fulfilment_service_zones z JOIN markets m ON m.id=z.market_id JOIN vendor_businesses v ON v.id=z.vendor_id JOIN vendor_locations l ON l.id=z.location_id
        WHERE ($1::uuid IS NULL OR z.vendor_id=$1) AND ($2::uuid IS NULL OR z.location_id=$2) ORDER BY z.priority DESC,z.public_id`, [vendorId, locationId]);
      return result.rows.map((row) => ({
        id: String(row.public_id), marketId: String(row.market_public_id), vendorId: String(row.vendor_public_id), locationId: String(row.location_public_id), mode: String(row.mode) as DeliveryZone["mode"],
        postcodePrefixes: Array.isArray(row.postcode_prefixes) ? row.postcode_prefixes.map(String) : [], center: row.lat === null || row.lat === undefined ? undefined : { lat: asNumber(row.lat, "latitude"), lon: asNumber(row.lon, "longitude") },
        radiusKm: row.radius_meters === null || row.radius_meters === undefined ? undefined : asNumber(row.radius_meters, "radius_meters") / 1000,
        active: Boolean(row.active), priority: asNumber(row.priority, "priority"), startsAt: epoch(row.starts_at)!, endsAt: epoch(row.ends_at)
      }));
    }, { readOnly: true });
  }
}
