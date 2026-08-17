import { createHmac, timingSafeEqual } from "node:crypto";

export type BoxNowEnvironment = "stage" | "production";

export type BoxNowConfig = Readonly<{
  environment: BoxNowEnvironment;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  partnerId?: string;
  requestTimeoutMs?: number;
}>;

export type BoxNowLocation = Readonly<{
  id: string;
  type: string;
  name?: string;
  title?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  country?: string;
  lat?: string;
  lng?: string;
  note?: string;
}>;

export type BoxNowContact = Readonly<{
  contactName: string;
  contactNumber: string;
  contactEmail: string;
  locationId: string;
}>;

export type BoxNowDeliveryItem = Readonly<{
  id: string;
  name: string;
  valueMajor: string;
  weightGrams?: number;
  compartmentSize?: 0 | 1 | 2;
}>;

export type BoxNowDeliveryRequest = Readonly<{
  orderNumber: string;
  invoiceValueMajor: string;
  allowReturn: boolean;
  origin: BoxNowContact;
  destination: BoxNowContact;
  items: readonly BoxNowDeliveryItem[];
}>;

export type BoxNowDeliveryResult = Readonly<{
  referenceNumber: string;
  parcelIds: readonly string[];
}>;

export type BoxNowParcel = Readonly<{
  id: string;
  state: string;
  itemRefId?: string;
  orderNumber?: string;
  events: readonly Readonly<{ type: string; createTime?: string; locationDisplayName?: string; postalCode?: string }>[];
}>;


export type BoxNowWebhookParcelEvent = Readonly<{
  id: string;
  type: string;
  event: "new" | "delivered" | "expired" | "returned" | "in-depot" | "final-destination" | "cancelled" | "accepted-for-return" | "missing" | "accepted-to-locker" | "lost" | string;
  eventTime: number;
  parcelId: string;
  orderNumber?: string;
  parcelReferenceNumber?: string;
  parcelName?: string;
  location?: Readonly<{ displayName?: string; postalCode?: string }>;
  customer?: Readonly<{ name?: string; email?: string; phoneNumber?: string }>;
  raw: Readonly<Record<string, unknown>>;
}>;

export class BoxNowApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message); this.name = "BoxNowApiError"; this.status = status; this.code = code;
  }
}

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}
function major(value: string, label: string): string {
  if (!/^\d+(?:\.\d{2})$/.test(value)) throw new Error(`${label} must be a decimal amount with two places`);
  return value;
}
function query(params: Readonly<Record<string, string | number | undefined>>): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") out.set(key, String(value));
  const text = out.toString(); return text ? `?${text}` : "";
}

export class BoxNowClient {
  readonly #config: BoxNowConfig;
  readonly #fetch: typeof fetch;
  #token?: { value: string; expiresAt: number };

  constructor(config: BoxNowConfig, fetchImpl: typeof fetch = fetch) {
    this.#config = { ...config, baseUrl: config.baseUrl.replace(/\/+$/, "") };
    this.#fetch = fetchImpl;
  }

  async readiness(): Promise<{ ok: boolean; environment: BoxNowEnvironment }> {
    await this.listOrigins("warehouse");
    return { ok: true, environment: this.#config.environment };
  }

  async listOrigins(locationType: "warehouse" | "any-apm" = "warehouse"): Promise<readonly BoxNowLocation[]> {
    const body = await this.#json("GET", `/api/v1/origins${query({ locationType })}`) as { data?: unknown };
    return normalizeLocations(body.data);
  }

  async listDestinations(input: { latlng?: string; radius?: number; requiredSize?: 0 | 1 | 2; locationType?: "apm" | "any-apm" } = {}): Promise<readonly BoxNowLocation[]> {
    const body = await this.#json("GET", `/api/v1/destinations${query({ ...input, locationType: input.locationType ?? "apm" })}`) as { data?: unknown };
    return normalizeLocations(body.data);
  }

  async createDelivery(request: BoxNowDeliveryRequest): Promise<BoxNowDeliveryResult> {
    required(request.orderNumber, "orderNumber"); major(request.invoiceValueMajor, "invoiceValueMajor");
    if (!request.items.length) throw new Error("BOX NOW delivery requires at least one parcel item");
    const payload = {
      orderNumber: request.orderNumber,
      invoiceValue: request.invoiceValueMajor,
      paymentMode: "prepaid",
      amountToBeCollected: "0.00",
      allowReturn: request.allowReturn,
      origin: normalizeContact(request.origin),
      destination: normalizeContact(request.destination),
      items: request.items.map((item) => ({
        id: required(item.id, "item.id"),
        name: required(item.name, "item.name"),
        value: major(item.valueMajor, "item.valueMajor"),
        weight: item.weightGrams ?? 0,
        compartmentSize: item.compartmentSize ?? 0
      }))
    };
    const body = await this.#json("POST", "/api/v1/delivery-requests", payload) as { referenceNumber?: unknown; parcels?: unknown };
    const referenceNumber = typeof body.referenceNumber === "string" ? body.referenceNumber : "";
    if (!referenceNumber) throw new Error("BOX NOW response did not include referenceNumber");
    const parcelIds = Array.isArray(body.parcels) ? body.parcels.map((p) => p && typeof p === "object" && typeof (p as { id?: unknown }).id === "string" ? (p as { id: string }).id : "").filter(Boolean) : [];
    if (!parcelIds.length) throw new Error("BOX NOW response did not include parcel IDs");
    return { referenceNumber, parcelIds };
  }

  async parcels(input: { orderNumber?: string; parcelId?: string; limit?: number } = {}): Promise<readonly BoxNowParcel[]> {
    const body = await this.#json("GET", `/api/v1/parcels${query({ orderNumber: input.orderNumber, parcelId: input.parcelId, limit: input.limit ?? 50 })}`) as { data?: unknown };
    if (!Array.isArray(body.data)) return [];
    return body.data.map((raw) => {
      const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const deliveryRequest = row.deliveryRequest && typeof row.deliveryRequest === "object" ? row.deliveryRequest as Record<string, unknown> : {};
      const events = Array.isArray(row.events) ? row.events.map((event) => {
        const e = event && typeof event === "object" ? event as Record<string, unknown> : {};
        return { type: String(e.type ?? "unknown"), createTime: typeof e.createTime === "string" ? e.createTime : undefined, locationDisplayName: typeof e.locationDisplayName === "string" ? e.locationDisplayName : undefined, postalCode: typeof e.postalCode === "string" ? e.postalCode : undefined };
      }) : [];
      return { id: String(row.id ?? ""), state: String(row.state ?? "unknown"), itemRefId: typeof row.itemRefId === "string" ? row.itemRefId : undefined, orderNumber: typeof deliveryRequest.orderNumber === "string" ? deliveryRequest.orderNumber : undefined, events };
    }).filter((p) => p.id);
  }

  async labelPdfForOrder(orderNumber: string): Promise<Uint8Array> {
    return this.#binary("GET", `/api/v1/delivery-requests/${encodeURIComponent(required(orderNumber, "orderNumber"))}/label.pdf`, "application/pdf");
  }

  async cancelParcel(parcelId: string): Promise<void> {
    await this.#json("POST", `/api/v1/parcels/${encodeURIComponent(required(parcelId, "parcelId"))}:cancel`, {});
  }

  async reconcileDelivery(orderNumber: string): Promise<BoxNowDeliveryResult | undefined> {
    const parcels = await this.parcels({ orderNumber });
    if (!parcels.length) return undefined;
    return { referenceNumber: orderNumber, parcelIds: parcels.map((p) => p.id) };
  }

  async #tokenValue(): Promise<string> {
    const now = Date.now();
    if (this.#token && this.#token.expiresAt > now + 30_000) return this.#token.value;
    const response = await this.#request("POST", "/api/v1/auth-sessions", {
      "content-type": "application/json",
      accept: "application/json"
    }, JSON.stringify({ grant_type: "client_credentials", client_id: required(this.#config.clientId, "BOX NOW client ID"), client_secret: required(this.#config.clientSecret, "BOX NOW client secret") }), false);
    const body = await response.json() as { access_token?: unknown; expires_in?: unknown };
    const token = typeof body.access_token === "string" ? body.access_token : "";
    const expires = Number(body.expires_in ?? 3600);
    if (!token) throw new Error("BOX NOW auth response did not include access_token");
    this.#token = { value: token, expiresAt: now + Math.max(60, Number.isFinite(expires) ? expires : 3600) * 1000 };
    return token;
  }

  async #json(method: string, path: string, body?: unknown): Promise<unknown> {
    const token = await this.#tokenValue();
    const response = await this.#request(method, path, { accept: "application/json", authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body !== undefined ? JSON.stringify(body) : undefined, true);
    if (response.status === 204 || response.headers.get("content-length") === "0") return {};
    return response.json();
  }

  async #binary(method: string, path: string, accept: string): Promise<Uint8Array> {
    const token = await this.#tokenValue();
    const response = await this.#request(method, path, { accept, authorization: `Bearer ${token}` }, undefined, true);
    return new Uint8Array(await response.arrayBuffer());
  }

  async #request(method: string, path: string, headers: Record<string, string>, body: string | undefined, authenticated: boolean): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs ?? 10_000);
    try {
      const response = await this.#fetch(`${this.#config.baseUrl}${path}`, { method, headers, body, signal: controller.signal });
      if (!response.ok) {
        let code: string | undefined; let message = `BOX NOW ${method} ${path} failed with HTTP ${response.status}`;
        try { const err = await response.json() as { code?: unknown; message?: unknown }; code = typeof err.code === "string" ? err.code : undefined; if (typeof err.message === "string" && err.message) message = err.message; } catch { /* keep generic error */ }
        if (authenticated && response.status === 401) this.#token = undefined;
        throw new BoxNowApiError(message, response.status, code);
      }
      return response;
    } finally { clearTimeout(timeout); }
  }
}

function normalizeContact(contact: BoxNowContact): BoxNowContact {
  return { contactName: required(contact.contactName, "contactName"), contactNumber: required(contact.contactNumber, "contactNumber"), contactEmail: required(contact.contactEmail, "contactEmail"), locationId: required(contact.locationId, "locationId") };
}
function normalizeLocations(value: unknown): readonly BoxNowLocation[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    return { id: String(row.id ?? ""), type: String(row.type ?? ""), name: typeof row.name === "string" ? row.name : undefined, title: typeof row.title === "string" ? row.title : undefined, addressLine1: typeof row.addressLine1 === "string" ? row.addressLine1 : undefined, addressLine2: typeof row.addressLine2 === "string" ? row.addressLine2 : undefined, postalCode: typeof row.postalCode === "string" ? row.postalCode : undefined, country: typeof row.country === "string" ? row.country : undefined, lat: typeof row.lat === "string" ? row.lat : undefined, lng: typeof row.lng === "string" ? row.lng : undefined, note: typeof row.note === "string" ? row.note : undefined };
  }).filter((row) => row.id);
}


function parseJsonString(raw: string, start: number): { value: string; end: number } {
  if (raw[start] !== '"') throw new Error("Expected JSON string");
  let i = start + 1;
  while (i < raw.length) {
    if (raw[i] === "\\") { i += 2; continue; }
    if (raw[i] === '"') {
      const token = raw.slice(start, i + 1);
      return { value: JSON.parse(token) as string, end: i + 1 };
    }
    i += 1;
  }
  throw new Error("Unterminated JSON string");
}
function skipWs(raw: string, start: number): number { let i=start; while(i<raw.length && /\s/.test(raw[i])) i++; return i; }
function scanJsonValue(raw: string, start: number): number {
  const i0=skipWs(raw,start); if(i0>=raw.length) throw new Error("Missing JSON value");
  if(raw[i0]==='"') return parseJsonString(raw,i0).end;
  if(raw[i0]==='{' || raw[i0]==='['){
    const open=raw[i0], close=open==='{'?'}':']'; let depth=0, i=i0, inString=false, escaped=false;
    for(;i<raw.length;i++){const ch=raw[i]; if(inString){if(escaped){escaped=false;continue;} if(ch==='\\'){escaped=true;continue;} if(ch==='"')inString=false;continue;} if(ch==='"'){inString=true;continue;} if(ch===open)depth++; else if(ch===close){depth--; if(depth===0)return i+1;}}
    throw new Error("Unterminated JSON container");
  }
  let i=i0; while(i<raw.length && !/[\s,}\]]/.test(raw[i])) i++; return i;
}
function rawTopLevelProperty(raw: string, wanted: string): string {
  let i=skipWs(raw,0); if(raw[i]!=="{") throw new Error("BOX NOW webhook must be a JSON object"); i++;
  while(i<raw.length){i=skipWs(raw,i); if(raw[i]==='}')break; const key=parseJsonString(raw,i); i=skipWs(raw,key.end); if(raw[i]!==':') throw new Error("Invalid webhook JSON"); i=skipWs(raw,i+1); const start=i, end=scanJsonValue(raw,i); if(key.value===wanted)return raw.slice(start,end); i=skipWs(raw,end); if(raw[i]===','){i++;continue;} if(raw[i]==='}')break; throw new Error("Invalid webhook JSON");}
  throw new Error(`BOX NOW webhook is missing ${wanted}`);
}

export function verifyBoxNowWebhook(rawBody: string, webhookSecret: string): BoxNowWebhookParcelEvent {
  const secret=required(webhookSecret,"BOX NOW webhook secret");
  let envelope: Record<string, unknown>;
  try { envelope=JSON.parse(rawBody) as Record<string, unknown>; } catch { throw new Error("Invalid BOX NOW webhook JSON"); }
  const signature=typeof envelope.datasignature==="string"?envelope.datasignature.trim().toLowerCase():"";
  if(!/^[0-9a-f]{64}$/.test(signature)) throw new Error("Invalid BOX NOW webhook data signature");
  const rawData=rawTopLevelProperty(rawBody,"data");
  const expected=createHmac("sha256",secret).update(rawData).digest("hex");
  const actualBuffer=Buffer.from(signature,"hex"), expectedBuffer=Buffer.from(expected,"hex");
  if(actualBuffer.length!==expectedBuffer.length || !timingSafeEqual(actualBuffer,expectedBuffer)) throw new Error("BOX NOW webhook signature verification failed");
  const data=envelope.data&&typeof envelope.data==="object"?envelope.data as Record<string,unknown>:undefined;
  if(!data) throw new Error("BOX NOW webhook is missing data object");
  const eventId=required(typeof envelope.id==="string"?envelope.id:"","BOX NOW webhook event id");
  const event=required(typeof data.event==="string"?data.event:"","BOX NOW webhook data.event");
  const parcelId=required(typeof data.parcelId==="string"?data.parcelId:"","BOX NOW webhook parcelId");
  const eventTimeText=required(typeof data.time==="string"?data.time:"","BOX NOW webhook data.time");
  const eventTime=Date.parse(eventTimeText); if(!Number.isFinite(eventTime)) throw new Error("Invalid BOX NOW webhook data.time");
  const location=data.eventLocation&&typeof data.eventLocation==="object"?data.eventLocation as Record<string,unknown>:undefined;
  const customer=data.customer&&typeof data.customer==="object"?data.customer as Record<string,unknown>:undefined;
  return {id:eventId,type:typeof envelope.type==="string"?envelope.type:"boxnow.parcel_event",event,eventTime,parcelId,orderNumber:typeof data.orderNumber==="string"?data.orderNumber:undefined,parcelReferenceNumber:typeof data.parcelReferenceNumber==="string"?data.parcelReferenceNumber:undefined,parcelName:typeof data.parcelName==="string"?data.parcelName:undefined,location:location?{displayName:typeof location.displayName==="string"?location.displayName:undefined,postalCode:typeof location.postalCode==="string"?location.postalCode:undefined}:undefined,customer:customer?{name:typeof customer.name==="string"?customer.name:undefined,email:typeof customer.email==="string"?customer.email:undefined,phoneNumber:typeof customer.phoneNumber==="string"?customer.phoneNumber:undefined}:undefined,raw:data};
}
