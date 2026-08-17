import test from "node:test";
import assert from "node:assert/strict";
import {
  PostgresAvailabilityRepository,
  openingInterval,
  type SqlPool,
  type SqlQueryResult,
  type SqlRow
} from "../src/index.ts";

class AvailabilityClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  #uuid = 0;
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM/i.test(text)) {
      this.#uuid += 1;
      return { rowCount: 1, rows: [{ id: `00000000-0000-4000-8000-${String(this.#uuid).padStart(12, "0")}` }] as Row[] };
    }
    if (/SELECT l\.public_id,v\.public_id AS vendor_public_id,m\.code AS market_public_id/i.test(text)) return { rowCount: 1, rows: [{ public_id: "location-public", vendor_public_id: "vendor-public", market_public_id: "sparta", name: "Second shop", address_line1: "20 Demo Street", locality: "Sparta", postcode: "23100", timezone: "Europe/Athens", active: true, is_primary: false, created_at: new Date("2026-08-14T10:00:00Z"), lat: 37.07, lon: 22.43 }] as Row[] };
    if (/FROM fulfilment_capacity_rules r JOIN vendor_businesses/i.test(text)) return { rowCount: 1, rows: [{ public_id: "capacity-public", vendor_public_id: "vendor-public", location_public_id: "location-public", mode: "pickup", max_open_fulfilments: 3, active: true, priority: 20, starts_at: new Date("2026-08-14T00:00:00Z"), ends_at: null }] as Row[] };
    if (/SELECT timezone FROM vendor_location_calendars/i.test(text)) return { rowCount: 1, rows: [{ timezone: "Europe/Athens" }] as Row[] };
    if (/FROM vendor_location_opening_intervals/i.test(text) && /^SELECT/i.test(text.trim())) return { rowCount: 2, rows: [{ weekday: 1, opens_minute: 510, closes_minute: 840 }, { weekday: 2, opens_minute: 510, closes_minute: 840 }] as Row[] };
    if (/FROM vendor_location_schedule_exceptions/i.test(text) && /LEFT JOIN vendor_location_exception_intervals/i.test(text)) return { rowCount: 0, rows: [] as Row[] };
    return { rowCount: /^\s*(INSERT|UPDATE|DELETE)/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() {}
}

function pool(client: AvailabilityClient): SqlPool {
  return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) };
}

test("Postgres availability schedule writes under actual vendor RLS scope", async () => {
  const client = new AvailabilityClient();
  const repository = new PostgresAvailabilityRepository(pool(client));
  await repository.saveSchedule({ scope: { marketId: "sparta" }, vendorId: "vendor-public", schedule: {
    locationId: "location-public", timezone: "Europe/Athens", weekly: [
      { weekday: 1, intervals: [openingInterval("08:30", "14:00")] },
      { weekday: 2, intervals: [openingInterval("08:30", "14:00"), openingInterval("17:30", "21:00")] }
    ], exceptions: [{ date: "2026-08-15", closed: true, reason: "Holiday" }]
  } });
  const vendorScope = client.calls.find((call) => /app.vendor_id/.test(String(call.params[0])));
  assert.ok(vendorScope);
  assert.equal(vendorScope?.params[1], "vendor-public");
  assert.equal(client.calls.some((call) => /INSERT INTO vendor_location_calendars/i.test(call.text)), true);
  assert.equal(client.calls.filter((call) => /INSERT INTO vendor_location_opening_intervals/i.test(call.text)).length, 3);
  assert.equal(client.calls.some((call) => /vendor_location_schedule_exceptions/i.test(call.text)), true);
});

test("Postgres delivery zone persistence keeps coverage separate from delivery pricing", async () => {
  const client = new AvailabilityClient();
  const repository = new PostgresAvailabilityRepository(pool(client));
  await repository.saveZone({ scope: { marketId: "sparta" }, zone: {
    id: "zone-public", marketId: "sparta", vendorId: "vendor-public", locationId: "location-public", mode: "local_delivery",
    postcodePrefixes: ["231"], active: true, priority: 10, startsAt: 1000
  } });
  const insert = client.calls.find((call) => /INSERT INTO fulfilment_service_zones/i.test(call.text));
  assert.ok(insert);
  assert.equal(insert?.params.includes("zone-public"), true);
  assert.equal(insert?.params.some((value) => Array.isArray(value) && value.includes("231")), true);
  assert.equal(client.calls.some((call) => /delivery_rules/i.test(call.text)), false);
});

test("Postgres schedule read preserves public location identifier", async () => {
  const client = new AvailabilityClient();
  const repository = new PostgresAvailabilityRepository(pool(client));
  const schedule = await repository.loadSchedule({ scope: { platformAccess: true }, locationId: "location-public" });
  assert.equal(schedule?.locationId, "location-public");
  assert.equal(schedule?.timezone, "Europe/Athens");
  assert.equal(schedule?.weekly.find((day) => day.weekday === 1)?.intervals[0].opensMinute, 510);
});


test("Postgres multi-location reads preserve public IDs and coordinates", async () => {
  const client = new AvailabilityClient();
  const repository = new PostgresAvailabilityRepository(pool(client));
  const locations = await repository.listLocations({ scope: { marketId: "sparta" }, vendorId: "vendor-public" });
  assert.equal(locations.length, 1);
  assert.equal(locations[0].id, "location-public");
  assert.equal(locations[0].vendorId, "vendor-public");
  assert.deepEqual(locations[0].coordinates, { lat: 37.07, lon: 22.43 });
});

test("Postgres capacity rules write under vendor scope and read as public IDs", async () => {
  const client = new AvailabilityClient();
  const repository = new PostgresAvailabilityRepository(pool(client));
  await repository.saveCapacityRule({ scope: { marketId: "sparta" }, rule: {
    id: "capacity-public", vendorId: "vendor-public", locationId: "location-public", mode: "pickup", maxOpenFulfilments: 3, active: true, priority: 20, startsAt: Date.parse("2026-08-14T00:00:00Z")
  } });
  assert.equal(client.calls.some((call) => /INSERT INTO fulfilment_capacity_rules/i.test(call.text)), true);
  const vendorScope = client.calls.find((call) => /app.vendor_id/.test(String(call.params[0])));
  assert.equal(vendorScope?.params[1], "vendor-public");
  const rules = await repository.listCapacityRules({ scope: { marketId: "sparta" }, vendorId: "vendor-public", locationId: "location-public" });
  assert.equal(rules[0].id, "capacity-public");
  assert.equal(rules[0].maxOpenFulfilments, 3);
});

test("Postgres vendor location write uses vendor scope and preserves public location identity", async () => {
  const client = new AvailabilityClient();
  const repository = new PostgresAvailabilityRepository(pool(client));
  await repository.saveLocation({ scope: { marketId: "sparta" }, location: {
    id: "location-branch", vendorId: "vendor-public", marketId: "sparta", name: "Branch", addressLine1: "30 Demo Street", locality: "Sparta", postcode: "23100", timezone: "Europe/Athens",
    coordinates: { lat: 37.075, lon: 22.43 }, active: true, primary: false, createdAt: Date.parse("2026-08-14T12:00:00Z")
  } });
  const insert = client.calls.find((call) => /INSERT INTO vendor_locations/i.test(call.text));
  assert.ok(insert);
  assert.equal(insert?.params.includes("location-branch"), true);
  const vendorScope = client.calls.find((call) => /app.vendor_id/.test(String(call.params[0])));
  assert.equal(vendorScope?.params[1], "vendor-public");
});
