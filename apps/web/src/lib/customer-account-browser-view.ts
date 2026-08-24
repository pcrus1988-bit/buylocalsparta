type CustomerPreferencesSource = Readonly<{
  recommendationsEnabled: boolean;
  recentlyViewedEnabled: boolean;
}>;

type SavedProductAlertSource = Readonly<{
  backInStockEnabled: boolean;
  priceDropEnabled: boolean;
  minimumPriceDropMinor: number;
}>;

type SavedSearchSource = Readonly<{
  id: string;
  name: string;
  alertsEnabled: boolean;
  lastObservedCount: number;
  query: Readonly<{
    q: string;
    availability?: "any" | "in_stock" | "pickup_today";
    categoryCode?: string;
  }>;
}>;

type RecentlyViewedSource = Readonly<{
  canonicalVariantId: string;
  viewedAt: number;
}>;

type PrivacyRequestSource = Readonly<{
  id: string;
  type: string;
  status: string;
  submittedAt: number;
  targetAt: number;
}>;

type NotificationSource = Readonly<{
  id: string;
  eventType: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  group: string;
  readAt?: number;
  createdAt: number;
}>;

type AddressSource = Readonly<{
  id: string;
  label: string;
  fullName: string;
  companyName?: string;
  vatNumber?: string;
  line1: string;
  line2?: string;
  locality: string;
  region?: string;
  postcode: string;
  countryCode: string;
  phone?: string;
  isDefaultBilling: boolean;
  isDefaultDelivery: boolean;
}>;

type AddressProfileSource = Readonly<{
  fullName: string;
  addresses: readonly AddressSource[];
}>;

type CartSource = Readonly<{
  items: readonly Readonly<{
    canonicalVariantId: string;
    title: string;
    quantity: number;
    priceMinor: number;
    available: boolean;
  }>[];
}>;

const CUSTOMER_NOTIFICATION_PAYLOAD_KEYS = new Set([
  "orderReference",
  "requestReference",
  "returnNumber",
  "returnReference",
  "canonicalVariantId",
  "caseReference",
  "referenceNumber",
  "privacyRequestType",
  "contextType",
  "contextReference"
]);

export function customerBrowserPreferences(source: CustomerPreferencesSource) {
  return {
    recommendationsEnabled: source.recommendationsEnabled,
    recentlyViewedEnabled: source.recentlyViewedEnabled
  };
}

export function customerBrowserSavedProductAlert(source: SavedProductAlertSource) {
  return {
    // `backInStockEnabled` remains the persisted compatibility field. In the
    // customer experience it means "notify me when an eligible local offer is
    // available again", so expose the clearer product-language alias too.
    localAvailabilityEnabled: source.backInStockEnabled,
    backInStockEnabled: source.backInStockEnabled,
    priceDropEnabled: source.priceDropEnabled,
    minimumPriceDropMinor: source.minimumPriceDropMinor
  };
}

export function customerBrowserSavedSearch(source: SavedSearchSource) {
  return {
    id: source.id,
    name: source.name,
    alertsEnabled: source.alertsEnabled,
    lastObservedCount: source.lastObservedCount,
    query: {
      q: source.query.q,
      ...(source.query.categoryCode ? { categoryCode: source.query.categoryCode } : {}),
      ...(source.query.availability ? { availability: source.query.availability } : {})
    }
  };
}

export function customerBrowserRecentlyViewed(source: RecentlyViewedSource) {
  return {
    canonicalVariantId: source.canonicalVariantId,
    viewedAt: source.viewedAt
  };
}

export function customerBrowserPrivacyRequest(source: PrivacyRequestSource) {
  return {
    id: source.id,
    type: source.type,
    status: source.status,
    submittedAt: source.submittedAt,
    targetAt: source.targetAt
  };
}

export function customerBrowserNotificationPayload(payload: Record<string, unknown>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!CUSTOMER_NOTIFICATION_PAYLOAD_KEYS.has(key) || typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized && normalized.length <= 240) safe[key] = normalized;
  }
  return safe;
}

export function customerBrowserNotification(source: NotificationSource) {
  return {
    id: source.id,
    eventType: source.eventType,
    title: source.title,
    body: source.body,
    payload: customerBrowserNotificationPayload(source.payload),
    group: source.group,
    readAt: source.readAt,
    createdAt: source.createdAt
  };
}

export function customerBrowserAddressProfile(source: AddressProfileSource) {
  return {
    fullName: source.fullName,
    addresses: source.addresses.map((address) => ({
      id: address.id,
      label: address.label,
      fullName: address.fullName,
      companyName: address.companyName,
      vatNumber: address.vatNumber,
      line1: address.line1,
      line2: address.line2,
      locality: address.locality,
      region: address.region,
      postcode: address.postcode,
      countryCode: address.countryCode,
      phone: address.phone,
      isDefaultBilling: address.isDefaultBilling,
      isDefaultDelivery: address.isDefaultDelivery
    }))
  };
}

export function customerBrowserCart(source: CartSource | undefined) {
  if (!source) return undefined;
  return {
    items: source.items.map((item) => ({
      canonicalVariantId: item.canonicalVariantId,
      title: item.title,
      quantity: item.quantity,
      priceMinor: item.priceMinor,
      available: item.available
    }))
  };
}
