import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type StyleBuilderAudience = "women" | "men";
export type StyleBuilderOccasion = "everyday" | "work" | "date" | "dinner" | "wedding" | "formal" | "party" | "travel";
export type StyleLookSource = "user" | "konta";

export type StyleBuilderProfile = Readonly<{
  audience: StyleBuilderAudience;
  sizes: Readonly<Record<string, string>>;
  colours: readonly string[];
  budgetMinor?: number;
  brands: readonly string[];
  occasion?: StyleBuilderOccasion;
}>;

export type StyleLookItem = Readonly<{
  slot: string;
  id: string;
  slug: string;
  title: string;
  price: string;
  priceMinor: number;
  categoryCode: string;
  brand?: string;
  color?: string;
  imageSrc?: string;
  vendorId?: string;
  vendorName?: string;
}>;

export type CustomerStyleLook = Readonly<{
  id: string;
  name: string;
  audience: StyleBuilderAudience;
  source: StyleLookSource;
  profile: StyleBuilderProfile;
  composition: readonly StyleLookItem[];
  totalMinor: number;
  shareEnabled: boolean;
  shareToken?: string;
  createdAt: string;
  updatedAt: string;
}>;

export type SharedStyleLook = Readonly<{
  name: string;
  audience: StyleBuilderAudience;
  source: StyleLookSource;
  composition: readonly StyleLookItem[];
  totalMinor: number;
  shareToken: string;
  createdAt: string;
}>;

type SharedStyleLookRow = Readonly<{
  share_token: string;
  name: string;
  audience: StyleBuilderAudience;
  source: StyleLookSource;
  composition: readonly StyleLookItem[];
  total_minor: number | string;
  created_at: Date | string;
}>;

type StyleLookRow = Readonly<{
  public_id: string;
  name: string;
  audience: StyleBuilderAudience;
  source: StyleLookSource;
  profile: StyleBuilderProfile;
  composition: readonly StyleLookItem[];
  total_minor: number | string;
  share_enabled: boolean;
  share_token: string;
  created_at: Date | string;
  updated_at: Date | string;
}>;

function safeText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeAudience(value: unknown): StyleBuilderAudience {
  if (value === "women" || value === "men") return value;
  throw new Error("Χρειάζεται έγκυρη επιλογή styling.");
}

function safeOccasion(value: unknown): StyleBuilderOccasion | undefined {
  if (value === "everyday" || value === "work" || value === "date" || value === "dinner" || value === "wedding" || value === "formal" || value === "party" || value === "travel") return value;
  return undefined;
}

function safeProfile(value: unknown, audience: StyleBuilderAudience): StyleBuilderProfile {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawSizes = raw.sizes && typeof raw.sizes === "object" && !Array.isArray(raw.sizes) ? raw.sizes as Record<string, unknown> : {};
  const sizes = Object.fromEntries(Object.entries(rawSizes).slice(0, 16).flatMap(([key, entry]) => {
    const cleanKey = safeText(key, 40);
    const cleanValue = safeText(entry, 40);
    return cleanKey && cleanValue ? [[cleanKey, cleanValue]] : [];
  }));
  const colours = Array.isArray(raw.colours)
    ? [...new Set(raw.colours.map((entry) => safeText(entry, 32)).filter(Boolean))].slice(0, 3)
    : [];
  const brands = Array.isArray(raw.brands)
    ? [...new Set(raw.brands.map((entry) => safeText(entry, 80)).filter(Boolean))].slice(0, 12)
    : [];
  const budget = Number(raw.budgetMinor);
  const budgetMinor = Number.isSafeInteger(budget) && budget > 0 && budget <= 10_000_000 ? budget : undefined;
  const occasion = safeOccasion(raw.occasion);
  return { audience, sizes, colours, brands, budgetMinor, occasion };
}

function safeComposition(value: unknown): readonly StyleLookItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 16).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const raw = entry as Record<string, unknown>;
    const id = safeText(raw.id, 128);
    const slug = safeText(raw.slug, 180);
    const title = safeText(raw.title, 240);
    const slot = safeText(raw.slot, 40);
    const categoryCode = safeText(raw.categoryCode, 120);
    const priceMinor = Number(raw.priceMinor);
    if (!id || !slug || !title || !slot || !categoryCode || !Number.isSafeInteger(priceMinor) || priceMinor <= 0) return [];
    return [{
      slot,
      id,
      slug,
      title,
      price: safeText(raw.price, 40),
      priceMinor,
      categoryCode,
      brand: safeText(raw.brand, 120) || undefined,
      color: safeText(raw.color, 80) || undefined,
      imageSrc: safeText(raw.imageSrc, 500) || undefined,
      vendorId: safeText(raw.vendorId, 128) || undefined,
      vendorName: safeText(raw.vendorName, 180) || undefined
    }];
  });
}

function rowToLook(row: StyleLookRow): CustomerStyleLook {
  return {
    id: String(row.public_id),
    name: row.name,
    audience: row.audience,
    source: row.source,
    profile: row.profile,
    composition: row.composition,
    totalMinor: Number(row.total_minor) || 0,
    shareEnabled: row.share_enabled,
    shareToken: row.share_enabled ? row.share_token : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

const SELECT_FIELDS = `
  l.public_id,l.name,l.audience,l.source,l.profile,l.composition,l.total_minor,
  l.share_enabled,l.share_token,l.created_at,l.updated_at
`;

export async function listCustomerStyleLooks(userPublicId: string): Promise<readonly CustomerStyleLook[]> {
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().nativePool.query<StyleLookRow>(`
    SELECT ${SELECT_FIELDS}
    FROM public.customer_style_looks l
    JOIN public.users u ON u.id=l.user_id
    WHERE u.public_id=$1 OR u.id::text=$1
    ORDER BY l.updated_at DESC,l.created_at DESC
    LIMIT 100
  `, [userPublicId]);
  return result.rows.map(rowToLook);
}

export async function getCustomerStyleLook(userPublicId: string, lookId: string): Promise<CustomerStyleLook | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().nativePool.query<StyleLookRow>(`
    SELECT ${SELECT_FIELDS}
    FROM public.customer_style_looks l
    JOIN public.users u ON u.id=l.user_id
    WHERE l.public_id::text=$1
      AND (u.public_id=$2 OR u.id::text=$2)
    LIMIT 1
  `, [lookId, userPublicId]);
  const row = result.rows[0];
  return row ? rowToLook(row) : undefined;
}

export async function createCustomerStyleLook(input: {
  userPublicId: string;
  name: unknown;
  audience: unknown;
  source: unknown;
  profile: unknown;
  composition: unknown;
}): Promise<CustomerStyleLook> {
  const audience = safeAudience(input.audience);
  const name = safeText(input.name, 120) || "Το look μου";
  const source: StyleLookSource = input.source === "konta" ? "konta" : "user";
  const profile = safeProfile(input.profile, audience);
  const composition = safeComposition(input.composition);
  if (!composition.length) throw new Error("Διάλεξε τουλάχιστον ένα προϊόν για το look.");
  const totalMinor = composition.reduce((sum, item) => sum + item.priceMinor, 0);
  const result = await getProductionPostgresRuntime().nativePool.query<StyleLookRow>(`
    INSERT INTO public.customer_style_looks(user_id,name,audience,source,profile,composition,total_minor)
    SELECT u.id,$2,$3,$4,$5::jsonb,$6::jsonb,$7
    FROM public.users u
    WHERE u.public_id=$1 OR u.id::text=$1
    ORDER BY (u.public_id=$1) DESC
    LIMIT 1
    RETURNING public_id,name,audience,source,profile,composition,total_minor,share_enabled,share_token,created_at,updated_at
  `, [input.userPublicId, name, audience, source, JSON.stringify(profile), JSON.stringify(composition), totalMinor]);
  const row = result.rows[0];
  if (!row) throw new Error("Ο λογαριασμός δεν βρέθηκε.");
  return rowToLook(row);
}

export async function updateCustomerStyleLook(input: {
  userPublicId: string;
  lookId: string;
  name?: unknown;
  profile?: unknown;
  composition?: unknown;
  shareEnabled?: unknown;
}): Promise<CustomerStyleLook> {
  const current = (await getProductionPostgresRuntime().nativePool.query<StyleLookRow>(`
    SELECT ${SELECT_FIELDS}
    FROM public.customer_style_looks l
    JOIN public.users u ON u.id=l.user_id
    WHERE l.public_id::text=$1 AND (u.public_id=$2 OR u.id::text=$2)
    LIMIT 1
  `, [input.lookId, input.userPublicId])).rows[0];
  if (!current) throw new Error("Το look δεν βρέθηκε.");

  const name = input.name === undefined ? current.name : safeText(input.name, 120) || current.name;
  const profile = input.profile === undefined ? current.profile : safeProfile(input.profile, current.audience);
  const composition = input.composition === undefined ? current.composition : safeComposition(input.composition);
  if (!composition.length) throw new Error("Το look χρειάζεται τουλάχιστον ένα προϊόν.");
  const totalMinor = composition.reduce((sum, item) => sum + item.priceMinor, 0);
  const shareEnabled = typeof input.shareEnabled === "boolean" ? input.shareEnabled : current.share_enabled;

  const result = await getProductionPostgresRuntime().nativePool.query<StyleLookRow>(`
    UPDATE public.customer_style_looks l
    SET name=$3,profile=$4::jsonb,composition=$5::jsonb,total_minor=$6,share_enabled=$7,updated_at=now()
    FROM public.users u
    WHERE l.user_id=u.id
      AND l.public_id::text=$1
      AND (u.public_id=$2 OR u.id::text=$2)
    RETURNING l.public_id,l.name,l.audience,l.source,l.profile,l.composition,l.total_minor,l.share_enabled,l.share_token,l.created_at,l.updated_at
  `, [input.lookId, input.userPublicId, name, JSON.stringify(profile), JSON.stringify(composition), totalMinor, shareEnabled]);
  const row = result.rows[0];
  if (!row) throw new Error("Το look δεν βρέθηκε.");
  return rowToLook(row);
}

export async function deleteCustomerStyleLook(userPublicId: string, lookId: string): Promise<boolean> {
  const result = await getProductionPostgresRuntime().nativePool.query(`
    DELETE FROM public.customer_style_looks l
    USING public.users u
    WHERE l.user_id=u.id
      AND l.public_id::text=$1
      AND (u.public_id=$2 OR u.id::text=$2)
  `, [lookId, userPublicId]);
  return (result.rowCount ?? 0) > 0;
}

export async function createSharedStyleLook(input: {
  shareToken?: unknown;
  name: unknown;
  audience: unknown;
  source: unknown;
  composition: unknown;
}): Promise<SharedStyleLook> {
  if (!productionDatabaseConfigured()) throw new Error("shared_style_look_unavailable");
  const audience = safeAudience(input.audience);
  const name = safeText(input.name, 120) || "Shared Look";
  const source: StyleLookSource = input.source === "konta" ? "konta" : "user";
  const requestedToken = safeText(input.shareToken, 36);
  if (requestedToken && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedToken)) {
    throw new Error("invalid_share_token");
  }
  const composition = safeComposition(input.composition);
  if (!composition.length) throw new Error("Διάλεξε τουλάχιστον ένα προϊόν για το look.");
  const totalMinor = composition.reduce((sum, item) => sum + item.priceMinor, 0);

  const result = await getProductionPostgresRuntime().nativePool.query<SharedStyleLookRow>(`
    INSERT INTO public.shared_style_looks(share_token,name,audience,source,composition,total_minor)
    VALUES (COALESCE($1::uuid, gen_random_uuid()),$2,$3,$4,$5::jsonb,$6)
    RETURNING share_token,name,audience,source,composition,total_minor,created_at
  `, [requestedToken || null, name, audience, source, JSON.stringify(composition), totalMinor]);
  const row = result.rows[0];
  if (!row) throw new Error("shared_style_look_failed");
  return {
    name: row.name,
    audience: row.audience,
    source: row.source,
    composition: row.composition,
    totalMinor: Number(row.total_minor) || 0,
    shareToken: row.share_token,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function getSharedStyleLook(token: string): Promise<SharedStyleLook | undefined> {
  if (!productionDatabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(token)) return undefined;

  const publicResult = await getProductionPostgresRuntime().nativePool.query<SharedStyleLookRow>(`
    SELECT share_token,name,audience,source,composition,total_minor,created_at
    FROM public.shared_style_looks
    WHERE share_token::text=$1
    LIMIT 1
  `, [token]);
  const shared = publicResult.rows[0];
  if (shared) {
    return {
      name: shared.name,
      audience: shared.audience,
      source: shared.source,
      composition: shared.composition,
      totalMinor: Number(shared.total_minor) || 0,
      shareToken: shared.share_token,
      createdAt: new Date(shared.created_at).toISOString()
    };
  }

  const legacyResult = await getProductionPostgresRuntime().nativePool.query<StyleLookRow>(`
    SELECT ${SELECT_FIELDS}
    FROM public.customer_style_looks l
    WHERE l.share_token::text=$1 AND l.share_enabled=true
    LIMIT 1
  `, [token]);
  const legacy = legacyResult.rows[0];
  if (!legacy) return undefined;
  return {
    name: legacy.name,
    audience: legacy.audience,
    source: legacy.source,
    composition: legacy.composition,
    totalMinor: Number(legacy.total_minor) || 0,
    shareToken: legacy.share_token,
    createdAt: new Date(legacy.created_at).toISOString()
  };
}
