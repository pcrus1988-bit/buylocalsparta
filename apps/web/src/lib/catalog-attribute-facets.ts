export type CatalogAttributeDefinition = Readonly<{
  key: string;
  label: string;
  sourceKeys: readonly string[];
}>;

export type CatalogAttributeOption = Readonly<{ value: string; label: string }>;
export type CatalogAttributeFacet = Readonly<{
  key: string;
  label: string;
  options: readonly CatalogAttributeOption[];
}>;

const DEFINITIONS = {
  lampType: definition("lamp_type", "Τύπος φωτιστικού", ["lamp_type", "light_type", "lighting_type", "fixture_type", "type_of_lamp", "type_of_light"]),
  socket: definition("socket", "Ντουί", ["socket", "socket_type", "bulb_socket", "lamp_socket", "base_type", "bulb_base", "cap_base"]),
  wattage: definition("wattage", "Ισχύς", ["wattage", "power", "power_w", "power_watts", "rated_power", "max_wattage", "bulb_power", "lamp_power"]),
  led: definition("led", "LED / πηγή φωτός", ["led", "light_source", "light_source_type", "bulb_type", "lamp_technology", "lighting_technology"]),
  dimmable: definition("dimmable", "Dimmable", ["dimmable", "dimming", "dimmer_compatible", "dimming_capability"]),
  environment: definition("environment", "Χρήση", ["environment", "indoor_outdoor", "usage_environment", "suitable_for", "location_type"]),
  material: definition("material", "Υλικό", ["material", "materials", "main_material", "product_material", "upper_material"]),
  colorTemperature: definition("color_temperature", "Θερμοκρασία χρώματος", ["color_temperature", "colour_temperature", "light_temperature", "kelvin", "cct"]),
  capacity: definition("capacity", "Χωρητικότητα", ["capacity", "volume_capacity", "capacity_l", "capacity_litres", "capacity_liters"]),
  dimensions: definition("dimensions", "Διαστάσεις", ["dimensions", "product_dimensions", "size_dimensions", "dimensions_wxhxd", "width_height_depth"]),
  room: definition("room", "Χώρος χρήσης", ["room", "room_type", "recommended_room", "use_room"]),
  gender: definition("gender", "Φύλο", ["gender", "target_gender", "sex", "gender_category"]),
  ageGroup: definition("age_group", "Ηλικιακή ομάδα", ["age_group", "target_age", "age_range", "recommended_age", "minimum_age", "age"]),
  bagType: definition("bag_type", "Τύπος τσάντας", ["bag_type", "type_of_bag", "style", "bag_style"]),
  skinType: definition("skin_type", "Τύπος δέρματος", ["skin_type", "suitable_skin_type", "recommended_skin_type"]),
  activeIngredients: definition("active_ingredients", "Δραστικά συστατικά", ["active_ingredients", "key_ingredients", "ingredients_highlights", "hero_ingredients"]),
  volume: definition("volume", "Όγκος / ποσότητα", ["volume", "volume_ml", "net_volume", "net_content", "content", "quantity"]),
  hairType: definition("hair_type", "Τύπος μαλλιών", ["hair_type", "suitable_hair_type", "recommended_hair_type"]),
  action: definition("action", "Δράση", ["action", "benefit", "benefits", "effect", "primary_benefit"]),
  concentration: definition("concentration", "Συγκέντρωση", ["concentration", "fragrance_concentration", "perfume_type", "eau_type"]),
  fragranceFamily: definition("fragrance_family", "Οικογένεια αρώματος", ["fragrance_family", "scent_family", "olfactory_family"]),
  toyType: definition("toy_type", "Τύπος παιχνιδιού", ["toy_type", "game_type", "product_type", "toy_category"]),
  players: definition("players", "Αριθμός παικτών", ["players", "number_of_players", "min_players", "max_players"]),
  voltage: definition("voltage", "Τάση", ["voltage", "voltage_v", "battery_voltage", "rated_voltage"]),
  chuckType: definition("chuck_type", "Τύπος τσοκ", ["chuck_type", "chuck", "tool_holder", "tool_holder_type"]),
  impact: definition("impact", "Κρούση", ["impact", "impact_function", "hammer_function", "percussion", "impact_drilling"]),
  rpm: definition("rpm", "Στροφές", ["rpm", "speed_rpm", "no_load_speed", "rotation_speed", "max_speed"]),
  tipType: definition("tip_type", "Τύπος μύτης", ["tip_type", "drive_type", "head_type", "screwdriver_tip"]),
  insulated: definition("insulated", "Μονωμένο", ["insulated", "insulation", "vde", "electrical_insulation"]),
  toolType: definition("tool_type", "Τύπος εργαλείου", ["tool_type", "garden_tool_type", "equipment_type"]),
  workingWidth: definition("working_width", "Πλάτος εργασίας", ["working_width", "cutting_width", "mowing_width"]),
  weight: definition("weight", "Βάρος", ["weight", "product_weight", "net_weight", "weight_kg"]),
  tyreSize: definition("tyre_size", "Διάσταση ελαστικού", ["tyre_size", "tire_size", "size_designation", "tyre_dimensions", "tire_dimensions"]),
  loadIndex: definition("load_index", "Δείκτης φορτίου", ["load_index", "tyre_load_index", "tire_load_index"]),
  speedRating: definition("speed_rating", "Δείκτης ταχύτητας", ["speed_rating", "speed_index", "tyre_speed_index", "tire_speed_index"]),
  season: definition("season", "Εποχή", ["season", "tyre_season", "tire_season", "seasonality"]),
  compatibility: definition("compatibility", "Συμβατότητα", ["compatibility", "compatible_with", "vehicle_compatibility", "supported_models"]),
  vehicleModel: definition("vehicle_model", "Μοντέλο οχήματος", ["vehicle_model", "car_model", "compatible_vehicle", "vehicle"]),
  storage: definition("storage", "Αποθήκευση", ["storage", "storage_capacity", "internal_storage", "internal_memory", "ssd_capacity", "drive_capacity"]),
  ram: definition("ram", "RAM", ["ram", "ram_memory", "memory_ram", "internal_ram", "system_memory"]),
  screenSize: definition("screen_size", "Μέγεθος οθόνης", ["screen_size", "display_size", "screen_diagonal", "display_diagonal", "inches"]),
  fiveG: definition("5g", "5G", ["5g", "5g_support", "network_5g", "mobile_5g"]),
  dualSim: definition("dual_sim", "Dual SIM", ["dual_sim", "dual_sim_support", "sim_slots", "number_of_sim_cards"]),
  processor: definition("processor", "Επεξεργαστής", ["processor", "cpu", "processor_model", "processor_family"]),
  connection: definition("connection", "Σύνδεση", ["connection", "connectivity", "connection_type", "wireless_technology", "interface"]),
  anc: definition("anc", "Active Noise Cancelling", ["anc", "active_noise_cancellation", "noise_cancelling", "noise_canceling"]),
  microphone: definition("microphone", "Μικρόφωνο", ["microphone", "built_in_microphone", "mic", "microphone_type"]),
  batteryLife: definition("battery_life", "Αυτονομία", ["battery_life", "battery_runtime", "playback_time", "operating_time"]),
  resolution: definition("resolution", "Ανάλυση", ["resolution", "display_resolution", "screen_resolution", "native_resolution"]),
  panelTechnology: definition("panel_technology", "Τεχνολογία panel", ["panel_technology", "display_technology", "panel_type", "screen_technology"]),
  smartTv: definition("smart_tv", "Smart TV", ["smart_tv", "smart_tv_support", "smart_features", "smart_platform"]),
  printTechnology: definition("print_technology", "Τεχνολογία εκτύπωσης", ["print_technology", "printing_technology", "printer_technology", "print_method"]),
  colorPrinting: definition("color_printing", "Έγχρωμη εκτύπωση", ["color_printing", "colour_printing", "print_color", "printing_colours"]),
  duplex: definition("duplex", "Duplex", ["duplex", "duplex_printing", "automatic_duplex", "two_sided_printing"]),
  author: definition("author", "Συγγραφέας", ["author", "authors", "writer"]),
  publisher: definition("publisher", "Εκδότης", ["publisher", "publishing_house", "imprint"]),
  isbn: definition("isbn", "ISBN", ["isbn", "isbn10", "isbn13"]),
  language: definition("language", "Γλώσσα", ["language", "book_language", "publication_language"]),
  itemType: definition("item_type", "Τύπος", ["item_type", "product_type", "stationery_type", "school_supply_type"])
} as const;

const BY_LEAF: Readonly<Record<string, readonly CatalogAttributeDefinition[]>> = {
  lighting: [DEFINITIONS.lampType, DEFINITIONS.socket, DEFINITIONS.wattage, DEFINITIONS.led, DEFINITIONS.dimmable, DEFINITIONS.environment, DEFINITIONS.material, DEFINITIONS.colorTemperature],
  kitchen: [DEFINITIONS.material, DEFINITIONS.capacity, DEFINITIONS.dimensions],
  furniture: [DEFINITIONS.material, DEFINITIONS.dimensions, DEFINITIONS.room],
  shoes: [DEFINITIONS.material, DEFINITIONS.gender, DEFINITIONS.ageGroup],
  "school-bags": [DEFINITIONS.bagType, DEFINITIONS.ageGroup, DEFINITIONS.gender, DEFINITIONS.material, DEFINITIONS.capacity, DEFINITIONS.dimensions],
  bags: [DEFINITIONS.bagType, DEFINITIONS.material, DEFINITIONS.capacity, DEFINITIONS.dimensions],
  dresses: [DEFINITIONS.material, DEFINITIONS.gender],
  skincare: [DEFINITIONS.skinType, DEFINITIONS.activeIngredients, DEFINITIONS.volume],
  haircare: [DEFINITIONS.hairType, DEFINITIONS.action, DEFINITIONS.volume],
  fragrance: [DEFINITIONS.concentration, DEFINITIONS.volume, DEFINITIONS.fragranceFamily],
  toys: [DEFINITIONS.ageGroup, DEFINITIONS.toyType, DEFINITIONS.players],
  baby: [DEFINITIONS.ageGroup, DEFINITIONS.material],
  drills: [DEFINITIONS.wattage, DEFINITIONS.voltage, DEFINITIONS.chuckType, DEFINITIONS.impact, DEFINITIONS.rpm],
  screwdrivers: [DEFINITIONS.tipType, DEFINITIONS.insulated, DEFINITIONS.material],
  "garden-tools": [DEFINITIONS.toolType, DEFINITIONS.wattage, DEFINITIONS.workingWidth],
  camping: [DEFINITIONS.capacity, DEFINITIONS.weight, DEFINITIONS.dimensions],
  tyres: [DEFINITIONS.tyreSize, DEFINITIONS.loadIndex, DEFINITIONS.speedRating, DEFINITIONS.season],
  "car-accessories": [DEFINITIONS.compatibility, DEFINITIONS.vehicleModel],
  smartphones: [DEFINITIONS.storage, DEFINITIONS.ram, DEFINITIONS.screenSize, DEFINITIONS.fiveG, DEFINITIONS.dualSim],
  laptops: [DEFINITIONS.processor, DEFINITIONS.ram, DEFINITIONS.storage, DEFINITIONS.screenSize],
  headphones: [DEFINITIONS.connection, DEFINITIONS.anc, DEFINITIONS.microphone, DEFINITIONS.batteryLife],
  televisions: [DEFINITIONS.screenSize, DEFINITIONS.resolution, DEFINITIONS.panelTechnology, DEFINITIONS.smartTv],
  printers: [DEFINITIONS.printTechnology, DEFINITIONS.colorPrinting, DEFINITIONS.duplex, DEFINITIONS.connection],
  books: [DEFINITIONS.author, DEFINITIONS.publisher, DEFINITIONS.isbn, DEFINITIONS.language],
  stationery: [DEFINITIONS.itemType]
};

const BY_KEY = new Map<string, CatalogAttributeDefinition>();
for (const definitions of Object.values(BY_LEAF)) for (const item of definitions) BY_KEY.set(item.key, item);

export function catalogAttributeDefinitionsForLeaf(leafKey?: string): readonly CatalogAttributeDefinition[] {
  return leafKey ? BY_LEAF[leafKey] ?? [] : [];
}

export function catalogAttributeDefinitionByKey(key: string): CatalogAttributeDefinition | undefined {
  return BY_KEY.get(key);
}

export function catalogAttributeValue(
  attributes: Readonly<Record<string, string>> | undefined,
  definition: CatalogAttributeDefinition | undefined
): string | undefined {
  if (!attributes || !definition) return undefined;
  for (const sourceKey of definition.sourceKeys) {
    const value = attributes[normalizeCatalogAttributeKey(sourceKey)];
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

export function catalogAttributeValueByKey(
  attributes: Readonly<Record<string, string>> | undefined,
  key: string
): string | undefined {
  return catalogAttributeValue(attributes, catalogAttributeDefinitionByKey(key));
}

export function normalizeCatalogAttributeKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function definition(key: string, label: string, sourceKeys: readonly string[]): CatalogAttributeDefinition {
  return { key, label, sourceKeys: [...new Set([key, ...sourceKeys].map(normalizeCatalogAttributeKey).filter(Boolean))] };
}
