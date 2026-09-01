import {
  AdviceService,
  AnalyticsService,
  BackgroundWorker,
  AuditLog,
  CartService,
  CatalogManagementService,
  CategoryGovernanceService,
  CommerceService,
  ContentService,
  DevPaymentProvider,
  DeliveryPricingService,
  DeliveryCoverageService,
  TradingCalendarService,
  VendorLocationDirectory,
  FulfilmentCapacityService,
  openingInterval,
  FairVendorExposureEngine,
  FairnessGovernanceService,
  FeeRuleEngine,
  InMemoryAuthService,
  InMemoryScheduledJobStore,
  InventoryEngine,
  InMemoryObjectStorage,
  InMemoryRateLimiter,
  OperationalHealthService,
  OrderOperationsService,
  SecurityEventService,
  Ledger,
  LocalSearchEngine,
  NotificationService,
  NotificationTemplateService,
  NotificationPreferenceService,
  NotificationOrchestrator,
  NotificationDeliveryWorker,
  DevNotificationProvider,
  ScheduledJobRunner,
  SearchIndexingService,
  StockFreshnessMonitor,
  StockFreshnessPolicy,
  offerStockIsFresh,
  ProductMediaService,
  ProductTrustService,
  PickupService,
  PlanService,
  PaymentDisputeService,
  launchPlanDefinitions,
  ProcurementService,
  ReturnService,
  RecallOperationsService,
  ReviewService,
  RetailPricingService,
  CouponService,
  CustomerPersonalizationService,
  SavedProductAlertService,
  SavedSearchService,
  CustomerRecommendationService,
  PrivacyRequestService,
  ShippingService,
  DevCourierProvider,
  MaintenanceJobs,
  SettlementService,
  TransactionalOutbox,
  VendorRegistry,
  money,
  type SellableVariant,
  type SupplierOffer
} from "../packages/core/src/index.ts";

export const demoVendors = [
  {
    id: "vendor-demo-arkadia-tech",
    name: "Demo Arkadia Tech",
    adviser: "Nikos",
    adviserId: "adviser-nikos",
    category: "Technology",
    story: "A fictional Sparta technology shop used only for development. Nikos focuses on practical setup, compatibility and after-sales advice.",
    expertise: ["Audio", "Mobile accessories", "Device setup"],
    area: "Sparta centre",
    hours: "Mon–Sat mornings · Tue/Thu/Fri evenings",
    verified: true
  },
  {
    id: "vendor-demo-lakonian-home",
    name: "Demo Lakonian Home",
    adviser: "Eleni",
    adviserId: "adviser-eleni",
    category: "Home",
    story: "A fictional home and lighting merchant created for platform testing, with an emphasis on advice and local pickup.",
    expertise: ["Lighting", "Home styling", "Small furnishings"],
    area: "Sparta centre",
    hours: "Mon–Sat mornings · Tue/Thu/Fri evenings",
    verified: true
  },
  {
    id: "vendor-demo-sparta-electro",
    name: "Demo Sparta Electro",
    adviser: "Maria",
    adviserId: "adviser-maria",
    category: "Technology",
    story: "A fictional electrical retailer used to prove identical-product fairness and rescue supplier routing.",
    expertise: ["Electrical goods", "Audio", "Warranty guidance"],
    area: "Sparta centre",
    hours: "Mon–Sat mornings · Tue/Thu/Fri evenings",
    verified: true
  },
  {
    id: "vendor-demo-paper-street",
    name: "Demo Paper Street",
    adviser: "Giorgos",
    adviserId: "adviser-giorgos",
    category: "Books & stationery",
    story: "A fictional stationery shop for development and testing of simple pickup-oriented commerce.",
    expertise: ["Stationery", "Gifts", "School supplies"],
    area: "Sparta centre",
    hours: "Mon–Sat mornings · Tue/Thu/Fri evenings",
    verified: true
  }
] as const;

export const demoVariants: SellableVariant[] = [
  { id: "cv-airpods-pro-2", marketId: "sparta", title: "Apple AirPods Pro 2 USB‑C", platformPrice: money(12_900), taxRateBps: 2400, categoryCode: "mobile-telecom-electronics" },
  { id: "cv-desk-lamp", marketId: "sparta", title: "Brass Reading Lamp", platformPrice: money(5_900), taxRateBps: 2400, categoryCode: "lighting-decor" },
  { id: "cv-notebook", marketId: "sparta", title: "Premium A5 Notebook", platformPrice: money(1_490), taxRateBps: 2400, categoryCode: "books-stationery-office-supplies" }
];

export const demoProductDetails: Record<string, {
  titleEl: string;
  titleEn: string;
  descriptionEl: string;
  categoryCode: string;
  categoryLabel: string;
  brand?: string;
  model?: string;
  identifiers?: string[];
  synonyms?: string[];
  adviceAvailable: boolean;
  accent: string;
}> = {
  "cv-airpods-pro-2": {
    titleEl: "Apple AirPods Pro 2 USB‑C",
    titleEn: "Apple AirPods Pro 2 USB-C",
    descriptionEl: "Ακουστικά με ενεργή ακύρωση θορύβου. Ένα δημόσιο προϊόν, με δίκαιη ανάθεση σε διαθέσιμο τοπικό συνεργάτη.",
    categoryCode: "mobile-telecom-electronics",
    categoryLabel: "Τεχνολογία",
    brand: "Apple",
    model: "AirPods Pro 2",
    identifiers: ["0195949052637", "MTJV3ZM/A"],
    synonyms: ["airpods", "ασύρματα ακουστικά", "earbuds"],
    adviceAvailable: true,
    accent: "audio"
  },
  "cv-desk-lamp": {
    titleEl: "Μπρούτζινο Φωτιστικό Ανάγνωσης",
    titleEn: "Brass Reading Lamp",
    descriptionEl: "Ζεστό επιτραπέζιο φωτιστικό για γραφείο ή γωνιά ανάγνωσης, διαθέσιμο για τοπική παραλαβή.",
    categoryCode: "lighting-decor",
    categoryLabel: "Σπίτι & Φωτισμός",
    brand: "Demo Home",
    model: "BR-01",
    synonyms: ["φωτιστικό", "λάμπα γραφείου", "desk lamp"],
    adviceAvailable: true,
    accent: "lamp"
  },
  "cv-notebook": {
    titleEl: "Premium Σημειωματάριο A5",
    titleEn: "Premium A5 Notebook",
    descriptionEl: "Σημειωματάριο A5 με σκληρό εξώφυλλο, για δουλειά, σχολείο ή δώρο.",
    categoryCode: "books-stationery-office-supplies",
    categoryLabel: "Βιβλία & Χαρτικά",
    brand: "Demo Paper",
    model: "A5 Classic",
    synonyms: ["τετράδιο", "σημειωματάριο", "notebook", "stationery"],
    adviceAvailable: true,
    accent: "paper"
  }
};

function offer(input: {
  offerId: string;
  vendorId: string;
  variantId: string;
  cost: number;
  mode?: "pickup" | "local_delivery" | "shipping";
  fit?: number;
  stockConfirmedAt?: number;
  locationId?: string;
}): SupplierOffer {
  return {
    offerId: input.offerId,
    vendorId: input.vendorId,
    locationId: input.locationId ?? `loc-${input.vendorId}`,
    canonicalVariantId: input.variantId,
    marketId: "sparta",
    approved: true,
    vendorActive: true,
    locationActive: true,
    productAllowed: true,
    availableToSell: 0,
    stockFresh: true,
    canServe: true,
    costWithinCeiling: true,
    capacityOpen: true,
    capacityWeight: 1,
    fulfilmentMode: input.mode ?? "pickup",
    fulfilmentFit: input.fit ?? 1,
    stockConfirmedAt: input.stockConfirmedAt ?? Date.now(),
    supplierUnitPrice: money(input.cost),
    supplierTaxRateBps: 2400
  };
}

export const demoOffers: Record<string, SupplierOffer[]> = {
  "cv-airpods-pro-2": [
    offer({ offerId: "offer-airpods-a", vendorId: "vendor-demo-arkadia-tech", variantId: "cv-airpods-pro-2", cost: 9_600 }),
    offer({ offerId: "offer-airpods-a-south", vendorId: "vendor-demo-arkadia-tech", locationId: "loc-vendor-demo-arkadia-tech-south", variantId: "cv-airpods-pro-2", cost: 9_600, fit: 0.95 }),
    offer({ offerId: "offer-airpods-b", vendorId: "vendor-demo-sparta-electro", variantId: "cv-airpods-pro-2", cost: 9_750 }),
    offer({ offerId: "offer-airpods-c", vendorId: "vendor-demo-lakonian-home", variantId: "cv-airpods-pro-2", cost: 9_650 })
  ],
  "cv-desk-lamp": [
    offer({ offerId: "offer-lamp-b", vendorId: "vendor-demo-lakonian-home", variantId: "cv-desk-lamp", cost: 3_700 })
  ],
  "cv-notebook": [
    offer({ offerId: "offer-note-d", vendorId: "vendor-demo-paper-street", variantId: "cv-notebook", cost: 780 })
  ]
};


function runtimeNotificationHealth(notifications: NotificationService): { state: "healthy" | "degraded"; message?: string } {
  const failed = notifications.all().filter((item) => item.channel !== "in_app" && item.status === "failed").length;
  if (failed > 0) return { state: "degraded", message: `${failed} external notification deliveries require attention` };
  return { state: "healthy" };
}

export function createDemoRuntime() {
  const analytics = new AnalyticsService();
  const rateLimiter = new InMemoryRateLimiter();
  const health = new OperationalHealthService();
  const securityEvents = new SecurityEventService();
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine();
  const fairnessGovernance = new FairnessGovernanceService();
  const payments = new DevPaymentProvider();
  const retailPricing = new RetailPricingService();
  const coupons = new CouponService();
  const personalization = new CustomerPersonalizationService();
  const savedProductAlerts = new SavedProductAlertService();
  const savedSearches = new SavedSearchService();
  const recommendations = new CustomerRecommendationService();
  const privacyRequests = new PrivacyRequestService();
  const seedPriceAt = Date.UTC(2026, 6, 1);
  for (const variant of demoVariants) retailPricing.registerInitialPrice({ marketId: variant.marketId, canonicalVariantId: variant.id, price: variant.platformPrice, effectiveAt: seedPriceAt });
  coupons.register({
    id: "coupon-local10", marketId: "sparta", code: "LOCAL10", name: "Local launch 10%", discountType: "percentage", rateBps: 1000,
    minSubtotal: money(1_000), maxDiscount: money(2_000), excludePrivateOffers: true, excludePromotionalPrices: false,
    startsAt: Date.UTC(2026, 7, 14), maxRedemptions: 500, maxPerSubject: 1, version: 1, active: true, createdBy: "system:seed", createdAt: Date.UTC(2026, 7, 14)
  });
  const deliveryPricing = new DeliveryPricingService();
  deliveryPricing.register({
    id: "delivery-local-sparta",
    marketId: "sparta",
    mode: "local_delivery",
    postcodePrefixes: ["231"],
    baseCharge: money(350),
    freeAboveSubtotal: money(7_500),
    priority: 10,
    version: 1,
    active: true,
    startsAt: Date.UTC(2026, 7, 14)
  });
  deliveryPricing.register({
    id: "delivery-greece-standard",
    marketId: "sparta",
    mode: "shipping",
    baseCharge: money(690),
    additionalPackageCharge: money(150),
    freeAboveSubtotal: money(15_000),
    priority: 1,
    version: 1,
    active: true,
    startsAt: Date.UTC(2026, 7, 14)
  });
  const tradingCalendar = new TradingCalendarService();
  const deliveryCoverage = new DeliveryCoverageService();
  const vendorLocations = new VendorLocationDirectory();
  const fulfilmentCapacity = new FulfilmentCapacityService();
  const standardWeek = [
    { weekday: 1, intervals: [openingInterval("08:30", "14:00")] },
    { weekday: 2, intervals: [openingInterval("08:30", "14:00"), openingInterval("17:30", "21:00")] },
    { weekday: 3, intervals: [openingInterval("08:30", "14:00")] },
    { weekday: 4, intervals: [openingInterval("08:30", "14:00"), openingInterval("17:30", "21:00")] },
    { weekday: 5, intervals: [openingInterval("08:30", "14:00"), openingInterval("17:30", "21:00")] },
    { weekday: 6, intervals: [openingInterval("08:30", "14:00")] },
    { weekday: 0, intervals: [] }
  ];
  for (const [index, vendor] of demoVendors.entries()) {
    const locationId = `loc-${vendor.id}`;
    vendorLocations.register({ id: locationId, vendorId: vendor.id, marketId: "sparta", name: `${vendor.name} · Main shop`, addressLine1: `${10 + index} Demo Street`, locality: "Sparta", postcode: "23100", timezone: "Europe/Athens", coordinates: { lat: 37.073 + index * 0.001, lon: 22.429 + index * 0.001 }, active: true, primary: true, createdAt: Date.UTC(2026, 7, 14) });
    tradingCalendar.setSchedule({ locationId, timezone: "Europe/Athens", weekly: standardWeek, exceptions: [{ date: "2026-08-15", closed: true, reason: "Public holiday" }] });
    deliveryCoverage.register({ id: `zone-local-${vendor.id}`, marketId: "sparta", vendorId: vendor.id, locationId, mode: "local_delivery", postcodePrefixes: ["231"], active: true, priority: 10, startsAt: Date.UTC(2026, 7, 14) });
    deliveryCoverage.register({ id: `zone-shipping-${vendor.id}`, marketId: "sparta", vendorId: vendor.id, locationId, mode: "shipping", active: true, priority: 1, startsAt: Date.UTC(2026, 7, 14) });
    for (const mode of ["pickup", "local_delivery", "shipping"] as const) fulfilmentCapacity.register({ id: `capacity-${vendor.id}-${mode}`, vendorId: vendor.id, locationId, mode, maxOpenFulfilments: mode === "pickup" ? 6 : 4, active: true, priority: 10, startsAt: Date.UTC(2026, 7, 14) });
  }
  vendorLocations.register({ id: "loc-vendor-demo-arkadia-tech-south", vendorId: "vendor-demo-arkadia-tech", marketId: "sparta", name: "Demo Arkadia Tech · South point", addressLine1: "99 Demo South Road", locality: "Sparta", postcode: "23100", timezone: "Europe/Athens", coordinates: { lat: 37.061, lon: 22.432 }, active: true, primary: false, createdAt: Date.UTC(2026, 7, 14) });
  tradingCalendar.setSchedule({ locationId: "loc-vendor-demo-arkadia-tech-south", timezone: "Europe/Athens", weekly: standardWeek, exceptions: [{ date: "2026-08-15", closed: true, reason: "Public holiday" }] });
  deliveryCoverage.register({ id: "zone-local-vendor-demo-arkadia-tech-south", marketId: "sparta", vendorId: "vendor-demo-arkadia-tech", locationId: "loc-vendor-demo-arkadia-tech-south", mode: "local_delivery", center: { lat: 37.061, lon: 22.432 }, radiusKm: 8, active: true, priority: 20, startsAt: Date.UTC(2026, 7, 14) });
  deliveryCoverage.register({ id: "zone-shipping-vendor-demo-arkadia-tech-south", marketId: "sparta", vendorId: "vendor-demo-arkadia-tech", locationId: "loc-vendor-demo-arkadia-tech-south", mode: "shipping", active: true, priority: 1, startsAt: Date.UTC(2026, 7, 14) });
  fulfilmentCapacity.register({ id: "capacity-arkadia-south-pickup", vendorId: "vendor-demo-arkadia-tech", locationId: "loc-vendor-demo-arkadia-tech-south", mode: "pickup", maxOpenFulfilments: 2, active: true, priority: 20, startsAt: Date.UTC(2026, 7, 14) });
  fulfilmentCapacity.register({ id: "capacity-arkadia-south-local", vendorId: "vendor-demo-arkadia-tech", locationId: "loc-vendor-demo-arkadia-tech-south", mode: "local_delivery", maxOpenFulfilments: 2, active: true, priority: 20, startsAt: Date.UTC(2026, 7, 14) });
  fulfilmentCapacity.register({ id: "capacity-arkadia-south-shipping", vendorId: "vendor-demo-arkadia-tech", locationId: "loc-vendor-demo-arkadia-tech-south", mode: "shipping", maxOpenFulfilments: 3, active: true, priority: 20, startsAt: Date.UTC(2026, 7, 14) });
  let commerce: CommerceService;
  const runtimeEligibility = (offer: SupplierOffer, context: { marketId: string; postcode: string; fulfilmentMode: "pickup" | "local_delivery" | "shipping"; now: number }) => {
    const canServe = deliveryCoverage.canServe({ vendorId: offer.vendorId, locationId: offer.locationId, context });
    const openFulfilments = commerce ? commerce.orders().filter((order) => order.fulfilmentMode === context.fulfilmentMode).flatMap((order) => order.fulfilments).filter((f) => f.vendorId === offer.vendorId && f.locationId === offer.locationId && !["delivered","rejected","failed","cancelled"].includes(f.status)).length : 0;
    const capacity = fulfilmentCapacity.status({ vendorId: offer.vendorId, locationId: offer.locationId, mode: context.fulfilmentMode, currentOpenFulfilments: openFulfilments, now: context.now });
    return { canServe, capacityOpen: capacity.open };
  };
  const catalog = new CatalogManagementService();
  const categoryGovernance = new CategoryGovernanceService();
  for (const definition of [
    { code: "colour", labelEl: "Χρώμα", labelEn: "Colour", dataType: "enum", values: ["white", "black", "brass", "blue", "red"], variantIdentity: true, filterable: true },
    { code: "connector", labelEl: "Σύνδεση", labelEn: "Connector", dataType: "enum", values: ["USB-C", "Lightning", "Bluetooth", "Other"], variantIdentity: true, filterable: true },
    { code: "wireless", labelEl: "Ασύρματο", labelEn: "Wireless", dataType: "boolean", filterable: true },
    { code: "material", labelEl: "Υλικό", labelEn: "Material", dataType: "enum", values: ["metal", "wood", "plastic", "paper"], filterable: true },
    { code: "size", labelEl: "Μέγεθος", labelEn: "Size", dataType: "enum", values: ["A4", "A5", "A6"], variantIdentity: true, filterable: true },
    { code: "cover", labelEl: "Εξώφυλλο", labelEn: "Cover", dataType: "enum", values: ["hard", "soft"], filterable: true }
  ] as const) categoryGovernance.registerAttribute(definition);
  const spartaCategoryPolicies = [
    ["adult-clothing", "Ενήλικη ένδυση", "standard"],
    ["bags-accessories-leather", "Τσάντες, αξεσουάρ & δερμάτινα", "standard"],
    ["children-baby-clothing", "Παιδικά & βρεφικά ρούχα", "standard"],
    ["footwear", "Υποδήματα", "standard"],
    ["jewellery-watches", "Κοσμήματα & ρολόγια", "standard"],
    ["optical-retail", "Οπτικά", "compatibility_sensitive"],
    ["sportswear-sporting-goods", "Αθλητικά είδη & ένδυση", "standard"],
    ["underwear-hosiery", "Εσώρουχα & καλσόν", "standard"],
    ["agricultural-supplies-machinery", "Αγροτικά εφόδια & μηχανήματα", "compatibility_sensitive"],
    ["beekeeping-supplies", "Μελισσοκομικά είδη", "compatibility_sensitive"],
    ["hunting-fishing-outdoor-goods", "Κυνήγι, ψάρεμα & υπαίθρια είδη", "regulated_mixed"],
    ["pet-animal-supplies", "Είδη κατοικιδίων & ζώων", "standard"],
    ["building-materials-timber", "Οικοδομικά υλικά & ξυλεία", "logistics_sensitive"],
    ["doors-windows-aluminium-railings", "Πόρτες, παράθυρα, αλουμίνια & κάγκελα", "logistics_sensitive"],
    ["hardware-tools-paint", "Σιδηρικά, εργαλεία & χρώματα", "compatibility_sensitive"],
    ["sanitary-plumbing-glazing", "Είδη υγιεινής, υδραυλικά & υαλοπίνακες", "compatibility_sensitive"],
    ["cosmetics-perfumery", "Καλλυντικά & αρωματοποιία", "standard"],
    ["orthopaedic-medical-hearing", "Ορθοπεδικά, ιατρικά & ακοής", "regulated_mixed"],
    ["pharmacies", "Φαρμακεία", "regulated_mixed"],
    ["beds-mattresses", "Κρεβάτια & στρώματα", "logistics_sensitive"],
    ["flowers-plants-garden", "Λουλούδια, φυτά & κήπος", "logistics_sensitive"],
    ["furniture-kitchens", "Έπιπλα & κουζίνες", "logistics_sensitive"],
    ["heating-cooling-fireplaces", "Θέρμανση, ψύξη & τζάκια", "compatibility_sensitive"],
    ["homeware-household-goods", "Οικιακά είδη", "standard"],
    ["lighting-decor", "Φωτισμός & διακόσμηση", "standard"],
    ["textiles-linen-curtains-carpets", "Υφάσματα, λευκά είδη, κουρτίνες & χαλιά", "standard"],
    ["computers-peripherals", "Υπολογιστές & περιφερειακά", "compatibility_sensitive"],
    ["electrical-appliances", "Ηλεκτρικές συσκευές", "standard"],
    ["electrical-security-business-equipment", "Ηλεκτρολογικός, ασφαλείας & επαγγελματικός εξοπλισμός", "compatibility_sensitive"],
    ["mobile-telecom-electronics", "Κινητά, τηλεπικοινωνίες & ηλεκτρονικά", "compatibility_sensitive"],
    ["parts-batteries-tyres-accessories", "Ανταλλακτικά, μπαταρίες, ελαστικά & αξεσουάρ", "compatibility_sensitive"],
    ["vehicles-motorcycles-bicycles", "Οχήματα, μοτοσικλέτες & ποδήλατα", "vehicles"],
    ["packaging-shop-office-equipment", "Συσκευασία, εξοπλισμός καταστήματος & γραφείου", "standard"],
    ["religious-ceremonial-goods", "Θρησκευτικά & τελετουργικά είδη", "standard"],
    ["tobacco-smoking-goods", "Καπνικά & είδη καπνίσματος", "directory_only"],
    ["books-stationery-office-supplies", "Βιβλία, χαρτικά & είδη γραφείου", "standard"],
    ["gifts-souvenirs-seasonal", "Δώρα, αναμνηστικά & εποχικά", "standard"],
    ["music-photo-collectibles", "Μουσική, φωτογραφία & συλλεκτικά", "standard"],
    ["toys-hobbies-games", "Παιχνίδια, χόμπι & games", "standard"]
  ] as const;
  for (const [categoryCode, labelEl, commerceMode] of spartaCategoryPolicies) categoryGovernance.registerCategory({ categoryCode, labelEl, commerceMode });
  categoryGovernance.registerCategory({ categoryCode: "mobile-telecom-electronics", labelEl: "Κινητά, τηλεπικοινωνίες & ηλεκτρονικά", labelEn: "Mobile, telecom & electronics", commerceMode: "compatibility_sensitive", attributes: [{ attributeCode: "colour", required: true, sortOrder: 10 }, { attributeCode: "connector", required: true, sortOrder: 20 }, { attributeCode: "wireless", sortOrder: 30 }], requireCompatibilityConfirmation: true });
  categoryGovernance.registerCategory({ categoryCode: "lighting-decor", labelEl: "Φωτισμός & διακόσμηση", labelEn: "Lighting & decor", commerceMode: "standard", attributes: [{ attributeCode: "colour", sortOrder: 10 }, { attributeCode: "material", sortOrder: 20 }] });
  categoryGovernance.registerCategory({ categoryCode: "books-stationery-office-supplies", labelEl: "Βιβλία, χαρτικά & γραφείο", labelEn: "Books, stationery & office", commerceMode: "standard", attributes: [{ attributeCode: "size", sortOrder: 10 }, { attributeCode: "cover", sortOrder: 20 }] });
  categoryGovernance.registerCategory({ categoryCode: "orthopaedic-medical-hearing", labelEl: "Ορθοπεδικά, ιατρικά & ακοής", commerceMode: "regulated_mixed" });
  categoryGovernance.registerCategory({ categoryCode: "tobacco-smoking-goods", labelEl: "Καπνικά & είδη καπνίσματος", commerceMode: "directory_only", counterofferAllowed: false });
  categoryGovernance.registerCategory({ categoryCode: "vehicles-motorcycles-bicycles", labelEl: "Οχήματα, μοτοσικλέτες & ποδήλατα", commerceMode: "vehicles" });
  const content = new ContentService();
  commerce = new CommerceService(inventory, fairness, payments, deliveryPricing, runtimeEligibility, (variant, now) => {
    if (!retailPricing.hasPriceHistory(variant.id)) retailPricing.registerInitialPrice({ marketId: variant.marketId, canonicalVariantId: variant.id, price: variant.platformPrice, effectiveAt: now, actorId: "system:auto-price-baseline" });
    return retailPricing.resolve(variant.id, now);
  });
  const cart = new CartService(fairness, inventory, runtimeEligibility);
  const advice = new AdviceService(fairness, {
    appointmentAllowed: ({ vendorId, startsAt, endsAt }) => tradingCalendar.containsRange(`loc-${vendorId}`, startsAt, endsAt),
    responseDeadline: (locationId, openedAt, businessMs) => tradingCalendar.addBusinessDuration(locationId, openedAt, businessMs)
  });
  const ledger = new Ledger();
  const procurement = new ProcurementService(ledger);
  const feeRules = new FeeRuleEngine();
  feeRules.register({
    id: "fee-founding-zero-sales-service",
    feeCode: "sales_service",
    marketId: "sparta",
    source: "plan",
    planCode: "founding_2026",
    calculation: "percentage",
    basis: "retail_net",
    rateBps: 0,
    taxRateBps: 2400,
    priority: 100,
    version: 1,
    active: true,
    startsAt: Date.UTC(2026, 7, 14)
  });
  const disputes = new PaymentDisputeService({ commerce, procurement, ledger });
  const returns = new ReturnService({ commerce, inventory, procurement, ledger });
  const recalls = new RecallOperationsService({ commerce, returns });
  const reviews = new ReviewService({ commerce, advice });
  const pickup = new PickupService({
    commerce,
    secret: process.env.PICKUP_SIGNING_SECRET && process.env.PICKUP_SIGNING_SECRET.length >= 32
      ? process.env.PICKUP_SIGNING_SECRET
      : "buy-local-sparta-development-pickup-secret-2026"
  });
  const settlements = new SettlementService(procurement);
  const outbox = new TransactionalOutbox();
  const audit = new AuditLog();
  const vendorRegistry = new VendorRegistry();
  const notifications = new NotificationService();
  const notificationTemplates = new NotificationTemplateService();
  const notificationPreferences = new NotificationPreferenceService();
  const notificationOrchestrator = new NotificationOrchestrator(notifications, notificationTemplates, notificationPreferences);
  const notificationTemplateEvents: Array<{ eventType: string; purpose: "transactional" | "service"; required: boolean }> = [
    { eventType: "order.authorised", purpose: "transactional", required: true },
    { eventType: "order.cancelled", purpose: "transactional", required: true },
    { eventType: "substitution.proposed", purpose: "transactional", required: true },
    { eventType: "substitution.approved", purpose: "transactional", required: true },
    { eventType: "substitution.rejected", purpose: "service", required: false },
    { eventType: "fulfilment.sla_breached", purpose: "service", required: false },
    { eventType: "fulfilment.sla_escalated", purpose: "service", required: false },
    { eventType: "fulfilment.created", purpose: "transactional", required: true },
    { eventType: "fulfilment.accepted", purpose: "service", required: false },
    { eventType: "fulfilment.delivered", purpose: "transactional", required: true },
    { eventType: "pickup.ready", purpose: "transactional", required: true },
    { eventType: "pickup.collected", purpose: "transactional", required: true },
    { eventType: "shipment.delivered", purpose: "transactional", required: true },
    { eventType: "return.refunded", purpose: "transactional", required: true },
    { eventType: "return.authorized", purpose: "transactional", required: true },
    { eventType: "return.remedy_approved", purpose: "transactional", required: true },
    { eventType: "return.replacement_ready", purpose: "transactional", required: true },
    { eventType: "return.repair_ready", purpose: "transactional", required: true },
    { eventType: "product.recall", purpose: "transactional", required: true },
    { eventType: "appointment.booked", purpose: "service", required: false },
    { eventType: "counteroffer.assigned", purpose: "service", required: false },
    { eventType: "counteroffer.offer_received", purpose: "service", required: false },
    { eventType: "catalog.product_approved", purpose: "service", required: false },
    { eventType: "vendor.activated", purpose: "transactional", required: true },
    { eventType: "settlement.paid", purpose: "transactional", required: true },
    { eventType: "content.story_approval_requested", purpose: "service", required: false },
    { eventType: "review.received", purpose: "service", required: false },
    { eventType: "review.response_received", purpose: "service", required: false },
    { eventType: "inventory.stock_due", purpose: "service", required: false },
    { eventType: "inventory.stock_stale", purpose: "service", required: false },
    { eventType: "saved_product.back_in_stock", purpose: "service", required: false },
    { eventType: "saved_product.price_drop", purpose: "service", required: false },
    { eventType: "saved_search.new_match", purpose: "service", required: false }
  ];
  for (const [index, item] of notificationTemplateEvents.entries()) {
    for (const locale of ["el", "en"] as const) notificationTemplates.register({
      id: `ntpl-${item.eventType.replace(/[^a-z0-9]+/gi, "-")}-${locale}-v1`, eventType: item.eventType, channel: "email", locale,
      purpose: item.purpose, revision: 1, titleTemplate: "{{title}}", bodyTemplate: "{{body}}", required: item.required, active: true,
      createdBy: "system:seed", createdAt: Date.UTC(2026, 7, 14) + index
    });
  }
  const plans = new PlanService();
  for (const plan of launchPlanDefinitions(Date.UTC(2026, 7, 14))) plans.register(plan);
  const search = new LocalSearchEngine();
  const stockFreshnessPolicy = new StockFreshnessPolicy({
    defaultTtlMs: 24 * 60 * 60 * 1000,
    defaultReminderLeadMs: 4 * 60 * 60 * 1000,
    categoryRules: {
      "mobile-telecom-electronics": { ttlMs: 6 * 60 * 60 * 1000, reminderLeadMs: 60 * 60 * 1000 },
      "electrical-appliances": { ttlMs: 6 * 60 * 60 * 1000, reminderLeadMs: 60 * 60 * 1000 },
      "books-stationery-office-supplies": { ttlMs: 48 * 60 * 60 * 1000, reminderLeadMs: 8 * 60 * 60 * 1000 },
      "lighting-decor": { ttlMs: 24 * 60 * 60 * 1000, reminderLeadMs: 4 * 60 * 60 * 1000 }
    }
  });
  const stockFreshness = new StockFreshnessMonitor(stockFreshnessPolicy);
  const objectStorage = new InMemoryObjectStorage();
  const media = new ProductMediaService(objectStorage);
  const trust = new ProductTrustService({ catalog, media });
  const shipping = new ShippingService({ commerce, provider: new DevCourierProvider() });
  const orderOperations = new OrderOperationsService({
    commerce,
    shipmentResolver: (orderId) => shipping.forOrder(orderId).map((item) => ({ fulfilmentId: item.fulfilmentId, trackingNumber: item.trackingNumber, carrier: item.carrier, status: item.status })),
    pickupResolver: (customerId, at) => pickup.forCustomer(customerId, at).map((item) => ({ fulfilmentId: item.fulfilmentId, status: item.status, readyAt: item.readyAt })),
    businessDeadline: (locationId, openedAt, businessMs) => tradingCalendar.addBusinessDuration(locationId, openedAt, businessMs)
  });
  const worker = new BackgroundWorker({ outbox, workerId: "dev-outbox-worker", maxAttempts: 4, baseRetryMs: 1_000 });
  worker.register("media.scan_requested", (event, now) => {
    const assetId = String((event.payload as any)?.assetId ?? "");
    const bytes = media.objectBytes(assetId);
    if (!bytes) throw new Error("Uploaded media object is missing");
    const text = new TextDecoder().decode(bytes);
    media.recordScan({ assetId, result: text.includes("EICAR") ? "infected" : "clean", reason: text.includes("EICAR") ? "Development malware signature detected" : undefined, now });
  });
  const maintenance = new MaintenanceJobs();
  maintenance.register("reservation_expiry", (now) => inventory.expire(now));
  maintenance.register("compliance_document_expiry", (now) => trust.refreshExpiry(now));

  const searchIndexer = new SearchIndexingService({
    backend: search,
    resolver: (canonicalVariantId, now) => {
      const canonical = catalog.canonical(canonicalVariantId);
      if (!canonical || !canonical.active || canonical.suppressed || canonical.recalled) return undefined;
      const offers = commerce.offersForVariant(canonicalVariantId).map((offer) => ({
        ...offer,
        availableToSell: inventory.hasOffer(offer.offerId) ? inventory.availableToSell(offer.offerId) : 0,
        stockFresh: offerStockIsFresh(offer, now)
      }));
      const sellable = offers.filter((offer) => offer.approved && offer.vendorActive && offer.locationActive && offer.productAllowed && offer.availableToSell > 0 && offer.stockFresh);
      const details = demoProductDetails[canonicalVariantId];
      return {
        id: canonical.id, type: "product" as const, marketId: canonical.marketId, title: canonical.titleEl, titleEl: canonical.titleEl,
        titleEn: canonical.titleEn ?? canonical.identity.title, body: canonical.descriptionEl ?? "", brand: canonical.identity.brand, model: canonical.identity.model,
        identifiers: [canonical.identity.gtin, canonical.identity.mpn].filter(Boolean) as string[], categoryCodes: [canonical.categoryCode], synonyms: canonical.synonyms,
        available: sellable.length > 0, pickupToday: sellable.some((offer) => offer.fulfilmentMode === "pickup"), adviceAvailable: canonical.adviceAvailable ?? false,
        priceMinor: (retailPricing.hasPriceHistory(canonical.id) ? retailPricing.resolve(canonical.id, now).currentPrice : canonical.platformPrice).minor, attributes: canonical.identity.attributes, metadata: { variantId: canonical.id, accent: details?.accent }
      };
    }
  });
  const alertRelevantEvents = ["offer.approved", "inventory.changed", "inventory.stock_due", "inventory.stock_stale", "inventory.stock_refreshed", "catalog.product_availability_changed", "pricing.base_price_changed", "promotion.changed"] as const;
  for (const eventType of alertRelevantEvents) worker.register(eventType, (event, now) => searchIndexer.handle(event, now));

  const reconcileSavedProductAlerts = (canonicalVariantId: string, now: number) => {
    const canonical = catalog.canonical(canonicalVariantId);
    if (!canonical || !retailPricing.hasPriceHistory(canonicalVariantId)) return [];
    const searchDocument = search.document(canonicalVariantId);
    const events = savedProductAlerts.reconcileProduct({ canonicalVariantId, available: Boolean(searchDocument?.available), priceMinor: retailPricing.resolve(canonicalVariantId, now).currentPrice.minor, now });
    for (const event of events) {
      if (event.type === "back_in_stock") notificationOrchestrator.emit({
        userId: event.userId, eventType: "saved_product.back_in_stock", title: "Ξανά διαθέσιμο το αποθηκευμένο προϊόν",
        body: `${canonical.titleEl} είναι ξανά διαθέσιμο μέσω Buy Local Sparta.`, payload: { canonicalVariantId, alertEventId: event.id },
        dedupeKey: `saved-product-alert:${event.id}`, now
      });
      else notificationOrchestrator.emit({
        userId: event.userId, eventType: "saved_product.price_drop", title: "Έπεσε η τιμή σε αποθηκευμένο προϊόν",
        body: `${canonical.titleEl} είναι τώρα ${(event.priceMinor ?? 0) / 100} €.`, payload: { canonicalVariantId, alertEventId: event.id, previousPriceMinor: event.previousPriceMinor, priceMinor: event.priceMinor, priceDropMinor: event.priceDropMinor },
        dedupeKey: `saved-product-alert:${event.id}`, now
      });
    }
    return events;
  };
  for (const eventType of alertRelevantEvents) worker.register(eventType, (event, now) => {
    const canonicalVariantId = String((event.payload as any)?.canonicalVariantId ?? event.aggregateId ?? "");
    if (canonicalVariantId) reconcileSavedProductAlerts(canonicalVariantId, now);
  });
  const reconcileSavedSearches = (now: number) => {
    const emitted = [];
    for (const savedSearch of savedSearches.active()) {
      const hits = search.search({ marketId: savedSearch.marketId, type: "product", ...savedSearch.query, limit: 100 });
      const currentIds = hits.map((hit) => hit.document.id);
      for (const event of savedSearches.reconcile({ searchId: savedSearch.id, currentCanonicalVariantIds: currentIds, now })) {
        const canonical = catalog.canonical(event.canonicalVariantId);
        if (!canonical) continue;
        notificationOrchestrator.emit({
          userId: event.userId, eventType: "saved_search.new_match", title: "Νέο τοπικό αποτέλεσμα σε αποθηκευμένη αναζήτηση",
          body: `${canonical.titleEl} ταιριάζει πλέον στην αναζήτηση «${savedSearch.name}».`,
          payload: { savedSearchId: savedSearch.id, savedSearchEventId: event.id, canonicalVariantId: event.canonicalVariantId },
          dedupeKey: `saved-search-alert:${event.id}`, now
        });
        emitted.push(event);
      }
    }
    return emitted;
  };
  for (const eventType of alertRelevantEvents) worker.register(eventType, (_event, now) => { reconcileSavedSearches(now); });
  worker.register("inventory.stock_due", (event, now) => {
    const payload = event.payload as any;
    notificationOrchestrator.emit({ vendorId: String(payload.vendorId), eventType: "inventory.stock_due", title: "Χρειάζεται επιβεβαίωση αποθέματος", body: `Επιβεβαιώστε σύντομα το απόθεμα για ${String(payload.canonicalVariantId)} ώστε να παραμείνει διαθέσιμο.`, payload, dedupeKey: `stock-due:${String(payload.offerId)}:${String(payload.expiresAt)}`, now });
  });
  worker.register("inventory.stock_stale", (event, now) => {
    const payload = event.payload as any;
    notificationOrchestrator.emit({ vendorId: String(payload.vendorId), eventType: "inventory.stock_stale", title: "Το απόθεμα χρειάζεται ανανέωση", body: `Η προσφορά ${String(payload.offerId)} βγήκε προσωρινά από την επιλέξιμη διαθεσιμότητα μέχρι να επιβεβαιωθεί το απόθεμα.`, payload, dedupeKey: `stock-stale:${String(payload.offerId)}:${String(payload.expiresAt)}`, now });
  });
  worker.register("fulfilment.sla_breached", (event, now) => {
    const payload = event.payload as any;
    notificationOrchestrator.emit({ vendorId: String(payload.vendorId), eventType: "fulfilment.sla_breached", title: "Προσοχή σε προθεσμία παραγγελίας", body: `Η εκπλήρωση ${String(payload.fulfilmentId)} ξεπέρασε την προθεσμία ${String(payload.stage)}.`, payload, dedupeKey: `sla-breached:${String(payload.id)}`, now });
  });
  worker.register("fulfilment.sla_escalated", (event, now) => {
    const payload = event.payload as any;
    notificationOrchestrator.emit({ vendorId: String(payload.vendorId), eventType: "fulfilment.sla_escalated", title: "Κλιμακωμένη καθυστέρηση παραγγελίας", body: `Η εκπλήρωση ${String(payload.fulfilmentId)} έχει κλιμακωθεί στην ομάδα λειτουργίας.`, payload, dedupeKey: `sla-escalated:${String(payload.id)}`, now });
    const order = commerce.getOrder(String(payload.orderId));
    if (order.customerId) notificationOrchestrator.emit({ userId: order.customerId, eventType: "fulfilment.sla_escalated", title: "Παρακολουθούμε μία καθυστέρηση", body: `Υπάρχει καθυστέρηση σε μέρος της παραγγελίας ${order.id}. Η ομάδα Buy Local Sparta το χειρίζεται.`, payload, dedupeKey: `customer-sla-escalated:${String(payload.id)}`, now });
  });

  const scheduledJobStore = new InMemoryScheduledJobStore();
  const scheduledJobs = new ScheduledJobRunner({ store: scheduledJobStore, ownerId: "dev-scheduler", leaseMs: 30_000 });
  scheduledJobs.register({ name: "reservation-expiry", intervalMs: 60_000, run: (now) => { inventory.expire(now); } });
  scheduledJobs.register({ name: "compliance-document-expiry", intervalMs: 60 * 60 * 1000, run: (now) => { trust.refreshExpiry(now); } });
  scheduledJobs.register({ name: "stock-freshness", intervalMs: 5 * 60 * 1000, run: (now) => {
    for (const transition of stockFreshness.scan(now)) {
      const type = transition.state === "stale" ? "inventory.stock_stale" : transition.state === "due_soon" ? "inventory.stock_due" : "inventory.stock_refreshed";
      outbox.enqueue({ type, aggregateType: "offer", aggregateId: transition.offerId, payload: transition, idempotencyKey: `${type}:${transition.offerId}:${transition.expiresAt}`, now });
    }
  } });
  scheduledJobs.register({ name: "search-reconcile", intervalMs: 30 * 60 * 1000, run: async (now) => {
    for (const product of catalog.canonicals({ marketId: "sparta" })) await searchIndexer.reindex(product.id, now);
  } });
  scheduledJobs.register({ name: "analytics-retention", intervalMs: 24 * 60 * 60 * 1000, run: (now) => { analytics.purgeBefore(now - 13 * 31 * 24 * 60 * 60 * 1000); } });
  scheduledJobs.register({ name: "fulfilment-sla", intervalMs: 5 * 60 * 1000, run: (now) => {
    for (const item of orderOperations.scanSla(now)) outbox.enqueue({ type: item.state === "escalated" ? "fulfilment.sla_escalated" : "fulfilment.sla_breached", aggregateType: "fulfilment", aggregateId: item.fulfilmentId, payload: item, idempotencyKey: `sla:${item.id}:${item.state}`, now });
  } });
  scheduledJobs.register({ name: "substitution-expiry", intervalMs: 5 * 60 * 1000, run: (now) => { orderOperations.expireSubstitutions(now); } });

  const auth = new InMemoryAuthService({
    secret: process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32
      ? process.env.AUTH_SECRET
      : "buy-local-sparta-development-secret-2026-only"
  });

  for (const variant of demoVariants) {
    const details = demoProductDetails[variant.id];
    catalog.registerCanonical({
      id: variant.id,
      marketId: variant.marketId,
      categoryCode: details.categoryCode,
      identity: {
        id: variant.id,
        title: details.titleEn,
        brand: details.brand,
        model: details.model,
        gtin: details.identifiers?.find((value) => /^\d{8,14}$/.test(value)),
        mpn: details.identifiers?.find((value) => !/^\d{8,14}$/.test(value)),
        condition: "new",
        warrantyBasis: "EU consumer warranty",
        attributes: variant.id === "cv-airpods-pro-2" ? { colour: "white", connector: "USB-C", wireless: "true" }
          : variant.id === "cv-desk-lamp" ? { colour: "brass", material: "metal" }
          : variant.id === "cv-notebook" ? { size: "A5", cover: "hard" }
          : {}
      },
      titleEl: details.titleEl,
      titleEn: details.titleEn,
      descriptionEl: details.descriptionEl,
      platformPrice: variant.platformPrice,
      taxRateBps: variant.taxRateBps,
      synonyms: details.synonyms,
      adviceAvailable: details.adviceAvailable,
      active: true,
      suppressed: false,
      recalled: false,
      createdAt: Date.UTC(2026, 7, 14),
      updatedAt: Date.UTC(2026, 7, 14)
    });
  }

  for (const [variantId, offers] of Object.entries(demoOffers)) {
    for (const [index, item] of offers.entries()) {
      inventory.seed({
        offerId: item.offerId,
        onHand: variantId === "cv-airpods-pro-2" ? 8 + index * 2 : 15,
        activeReservations: 0,
        safetyStock: 1,
        blocked: 0,
        updatedAt: Date.now()
      });
    }
    const variant = demoVariants.find((entry) => entry.id === variantId)!;
    const details = demoProductDetails[variantId];
    const rule = stockFreshnessPolicy.ruleFor(details.categoryCode);
    const governedOffers = offers.map((item) => ({ ...item, stockTtlMs: rule.ttlMs }));
    commerce.registerVariant(variant, governedOffers);
    cart.registerVariantOffers(variantId, governedOffers);
    for (const item of governedOffers) stockFreshness.register({ offerId: item.offerId, vendorId: item.vendorId, canonicalVariantId: variantId, categoryCode: details.categoryCode, confirmedAt: item.stockConfirmedAt });
    search.upsert({
      id: variant.id,
      type: "product",
      marketId: variant.marketId,
      title: details.titleEl,
      titleEl: details.titleEl,
      titleEn: details.titleEn,
      body: details.descriptionEl,
      brand: details.brand,
      model: details.model,
      identifiers: details.identifiers,
      categoryCodes: [details.categoryCode],
      synonyms: details.synonyms,
      available: true,
      pickupToday: true,
      adviceAvailable: details.adviceAvailable,
      priceMinor: retailPricing.resolve(variant.id, Date.now()).currentPrice.minor,
      attributes: catalog.canonical(variant.id)?.identity.attributes ?? {},
      metadata: { variantId: variant.id }
    });
  }

  for (const vendor of demoVendors) {
    search.upsert({
      id: vendor.id,
      type: "vendor",
      marketId: "sparta",
      title: vendor.name,
      body: `${vendor.story} ${vendor.expertise.join(" ")}`,
      synonyms: [vendor.category, ...vendor.expertise],
      adviceAvailable: true,
      available: true,
      metadata: { vendorId: vendor.id }
    });
  }

  const contentSeedAt = Date.UTC(2026, 7, 14, 9, 0, 0);
  const homePage = content.createPage({
    marketId: "sparta", pageType: "home", slug: "", actorId: "system:seed", now: contentSeedAt,
    translations: [
      { locale: "el", title: "Αρχική", seo: { title: "Buy Local Sparta — Η τοπική αγορά της Σπάρτης", description: "Ανακάλυψε προϊόντα, πραγματικά τοπικά καταστήματα και ανθρώπινη συμβουλή στη Σπάρτη." }, blocks: [
        { id: "home-hero", type: "hero", data: { eyebrow: "Σπάρτη · πραγματικά καταστήματα · πραγματικοί άνθρωποι", heading: "Βρες το τοπικά. Ρώτα κάποιον που ξέρει.", body: "Η ψηφιακή αγορά της Σπάρτης με μία καθαρή εμπειρία αγοράς και τους ανθρώπους των τοπικών καταστημάτων στο προσκήνιο." } },
        { id: "home-story", type: "merchant_spotlight", data: { storySlug: "to-fos-piso-apo-to-fotistiko", vendorId: "vendor-demo-lakonian-home" } },
        { id: "home-today", type: "product_collection", data: { collectionSlug: "diathesima-simera" } },
        { id: "home-advice", type: "advice_cta", data: { heading: "Δεν ξέρεις ακριβώς τι χρειάζεσαι;", body: "Ρώτα έναν τοπικό επαγγελματία πριν αγοράσεις." } },
        { id: "home-ask-local", type: "ask_local_cta", data: { heading: "Το βρήκες αλλού; Ρώτα τοπικά.", body: "Στείλε ιδιωτικά το link και ζήτησε μία συνολική τοπική πρόταση." } }
      ] },
      { locale: "en", title: "Home", seo: { title: "Buy Local Sparta — Sparta's local marketplace", description: "Discover products, real local shops and human advice in Sparta, Greece." }, blocks: [
        { id: "home-hero-en", type: "hero", data: { eyebrow: "Sparta · real shops · real people", heading: "Find it locally. Ask someone who knows.", body: "Sparta's digital shopping centre with one clear purchase experience and local people at the centre." } },
        { id: "home-advice-en", type: "advice_cta", data: { heading: "Not sure what you need?", body: "Ask a local expert before you buy." } }
      ] }
    ]
  });
  content.publishPage({ pageId: homePage.id, actorId: "system:seed", now: contentSeedAt + 1 });
  const spartaLanding = content.createPage({
    marketId: "sparta", pageType: "local_landing", slug: "sparta", actorId: "system:seed", now: contentSeedAt,
    translations: [{ locale: "el", title: "Αγορές στη Σπάρτη", seo: { title: "Αγορές στη Σπάρτη | Buy Local Sparta", description: "Βρες τοπικά καταστήματα, προϊόντα, παραλαβή και συμβουλή στη Σπάρτη." }, blocks: [
      { id: "sparta-local", type: "rich_text", data: { heading: "Η αγορά της πόλης σε ένα σημείο", body: "Πραγματική τοπική διαθεσιμότητα, παραλαβή, αποστολή και άνθρωποι που γνωρίζουν τα προϊόντα τους." } }
    ] }]
  });
  content.publishPage({ pageId: spartaLanding.id, actorId: "system:seed", now: contentSeedAt + 2 });
  content.setNavigation({ marketId: "sparta", key: "primary", locale: "el", actorId: "system:seed", now: contentSeedAt, items: [
    { id: "shop", label: "Αγορά", href: "/#shop" }, { id: "people", label: "Καταστήματα & Άνθρωποι", href: "/#people" },
    { id: "advice", label: "Συμβουλή", href: "/#advice" }, { id: "ask-local", label: "Ask Local", href: "/#asklocal" }
  ] });
  content.setNavigation({ marketId: "sparta", key: "primary", locale: "en", actorId: "system:seed", now: contentSeedAt, items: [
    { id: "shop", label: "Shop", href: "/#shop" }, { id: "people", label: "Shops & People", href: "/#people" },
    { id: "advice", label: "Advice", href: "/#advice" }, { id: "ask-local", label: "Ask Local", href: "/#asklocal" }
  ] });
  content.addRedirect({ marketId: "sparta", fromPath: "/shop", toPath: "/el", actorId: "system:seed", now: contentSeedAt });
  const demoStory = content.createStory({ marketId: "sparta", vendorId: "vendor-demo-lakonian-home", slug: "to-fos-piso-apo-to-fotistiko", locale: "el", title: "Το φως πίσω από το φωτιστικό", excerpt: "Η Ελένη εξηγεί γιατί η σωστή επιλογή φωτισμού ξεκινά από το δωμάτιο και όχι από την τιμή.", blocks: [
    { id: "story-intro", type: "shop_story", data: { text: "Σε ένα τοπικό κατάστημα, η ερώτηση δεν είναι μόνο “πόσο κάνει;” αλλά “πού θα μπει, τι φως χρειάζεσαι και πώς θέλεις να νιώθει ο χώρος;”." } }
  ], seo: { title: "Το φως πίσω από το φωτιστικό | Buy Local Sparta", description: "Γνώρισε την ανθρώπινη πλευρά ενός τοπικού καταστήματος φωτισμού στη Σπάρτη." }, authorLabel: "Buy Local Sparta editorial", now: contentSeedAt });
  content.requestStoryApproval(demoStory.id, contentSeedAt + 1);
  content.approveStory({ storyId: demoStory.id, vendorId: "vendor-demo-lakonian-home", actorId: "seed-vendor-owner", now: contentSeedAt + 2 });
  content.publishStory({ storyId: demoStory.id, actorId: "system:seed", now: contentSeedAt + 3 });
  const todayCollection = content.createCollection({ marketId: "sparta", slug: "diathesima-simera", locale: "el", title: "Διαθέσιμα σήμερα", description: "Επιλεγμένα προϊόντα με φρέσκια τοπική διαθεσιμότητα.", canonicalVariantIds: demoVariants.map((item) => item.id), seo: { title: "Διαθέσιμα σήμερα στη Σπάρτη", description: "Προϊόντα που μπορείς να βρεις τοπικά στη Σπάρτη σήμερα." }, actorId: "system:seed", now: contentSeedAt });
  content.publishCollection({ collectionId: todayCollection.id, actorId: "system:seed", now: contentSeedAt + 4 });

  scheduledJobs.register({ name: "cms-scheduled-publication", intervalMs: 60_000, run: (now) => { content.releaseScheduled(now); } });
  scheduledJobs.register({ name: "promotion-lifecycle", intervalMs: 60_000, run: (runAt) => {
    for (const change of retailPricing.synchronize(runAt)) outbox.enqueue({ type: "promotion.changed", aggregateType: "canonical_product", aggregateId: change.canonicalVariantId, payload: { canonicalVariantId: change.canonicalVariantId, promotionId: change.promotionId, status: change.status }, idempotencyKey: `promotion-lifecycle:${change.promotionId}:${change.status}`, now: runAt });
  } });

  const now = Date.now();
  const demoAccounts = {
    customer: auth.register({ email: "customer@demo.local", password: "Customer!123", roles: ["customer"], emailVerified: true, now }),
    vendor: auth.register({ email: "tech@demo.local", password: "VendorOwner!123", roles: ["vendor_owner"], vendorId: "vendor-demo-arkadia-tech", emailVerified: true, now }),
    homeVendor: auth.register({ email: "home@demo.local", password: "VendorOwner!123", roles: ["vendor_owner"], vendorId: "vendor-demo-lakonian-home", emailVerified: true, now }),
    admin: auth.register({ email: "admin@demo.local", password: "AdminStrong!123", roles: ["super_admin"], emailVerified: true, now }),
    financeChecker: auth.register({ email: "finance@demo.local", password: "FinanceStrong!123", roles: ["platform_finance"], emailVerified: true, now })
  };

  const devEmailProvider = new DevNotificationProvider("email");
  const devSmsProvider = new DevNotificationProvider("sms");
  const devPushProvider = new DevNotificationProvider("push");
  const notificationDelivery = new NotificationDeliveryWorker({
    service: notifications,
    workerId: "dev-notification-worker",
    providers: [devEmailProvider, devSmsProvider, devPushProvider],
    resolver: {
      resolve(notification) {
        if (notification.userId) {
          const account = auth.account(notification.userId);
          return account ? { channel: notification.channel as "email" | "sms" | "push", value: notification.channel === "email" ? account.email : `dev-${notification.channel}-${account.id}` } : undefined;
        }
        if (notification.vendorId) {
          const owner = auth.accounts().find((account) => account.vendorId === notification.vendorId && account.roles.includes("vendor_owner"));
          return owner ? { channel: notification.channel as "email" | "sms" | "push", value: notification.channel === "email" ? owner.email : `dev-${notification.channel}-${owner.id}` } : undefined;
        }
        return undefined;
      }
    }
  });
  scheduledJobs.register({ name: "notification-delivery", intervalMs: 60_000, run: async (runAt) => { await notificationDelivery.runOnce(runAt, 50); } });
  scheduledJobs.register({ name: "security-event-retention", intervalMs: 24 * 60 * 60 * 1000, run: (runAt) => { securityEvents.purge(runAt - 90 * 24 * 60 * 60 * 1000); } });
  scheduledJobs.register({ name: "recently-viewed-retention", intervalMs: 24 * 60 * 60 * 1000, run: (runAt) => { personalization.purgeExpired(runAt); } });
  scheduledJobs.register({ name: "saved-product-alert-reconcile", intervalMs: 15 * 60 * 1000, run: (runAt) => { for (const canonicalVariantId of savedProductAlerts.productIds()) reconcileSavedProductAlerts(canonicalVariantId, runAt); } });
  scheduledJobs.register({ name: "saved-search-alert-reconcile", intervalMs: 15 * 60 * 1000, run: (runAt) => { reconcileSavedSearches(runAt); } });
  scheduledJobs.register({ name: "rate-limit-prune", intervalMs: 60 * 60 * 1000, run: (runAt) => { rateLimiter.prune(runAt); } });

  health.register({ name: "catalog", critical: true, check: () => catalog.canonicals({ marketId: "sparta", activeOnly: true }).length > 0 ? undefined : ({ state: "unhealthy", message: "No active Sparta canonical products" }) });
  health.register({ name: "search_projection", critical: true, check: () => search.documents().some((document) => document.marketId === "sparta" && document.type === "product") ? undefined : ({ state: "unhealthy", message: "Public search projection is empty" }) });
  health.register({ name: "scheduled_jobs", critical: false, check: () => ({ state: "healthy", message: "Development scheduler registered" }) });
  health.register({ name: "notification_delivery", critical: false, check: () => runtimeNotificationHealth(notifications) });
  health.register({ name: "fulfilment_sla", critical: false, check: () => orderOperations.slaCases({ activeOnly: true }).some((item) => item.state === "escalated") ? ({ state: "degraded", message: "Escalated fulfilment SLA cases require attention" }) : undefined });

  return { analytics, rateLimiter, health, securityEvents, inventory, fairness, fairnessGovernance, payments, retailPricing, coupons, personalization, savedProductAlerts, savedSearches, recommendations, reconcileSavedProductAlerts, reconcileSavedSearches, privacyRequests, deliveryPricing, deliveryCoverage, tradingCalendar, vendorLocations, fulfilmentCapacity, feeRules, disputes, catalog, categoryGovernance, content, commerce, orderOperations, cart, advice, ledger, procurement, returns, recalls, reviews, pickup, settlements, outbox, audit, vendorRegistry, notifications, notificationTemplates, notificationPreferences, notificationOrchestrator, notificationDelivery, notificationProviders: { email: devEmailProvider, sms: devSmsProvider, push: devPushProvider }, plans, search, searchIndexer, stockFreshnessPolicy, stockFreshness, objectStorage, media, trust, shipping, worker, maintenance, scheduledJobStore, scheduledJobs, auth, demoAccounts };
}
