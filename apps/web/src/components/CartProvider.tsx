"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type CartItem = Readonly<{
  canonicalVariantId: string;
  title: string;
  priceMinor: number;
  price: string;
  quantity: number;
  imageUrl?: string;
  imageAlt?: string;
  sku?: string;
  gtin?: string;
  color?: string;
  size?: string;
  fulfilmentKind?: "local" | "partner";
  regularPriceMinor?: number;
  flashSale?: boolean;
  quantityCap?: number;
  flashExpiresAt?: string;
}>;

type CartContextValue = Readonly<{
  items: readonly CartItem[];
  count: number;
  subtotalMinor: number;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  hydrated: boolean;
  detailsReady: boolean;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  cartPulseKey: number;
}>;

type CartProductDetails = Readonly<{
  canonicalVariantId: string;
  imageUrl?: string;
  imageAlt?: string;
  sku?: string;
  gtin?: string;
  color?: string;
  size?: string;
  fulfilmentKind?: "local" | "partner";
}>;

type ServerCartItem = Readonly<{
  canonicalVariantId: string;
  title: string;
  priceMinor: number;
  quantity: number;
  regularPriceMinor?: number;
  flashSale?: boolean;
  quantityCap?: number;
  flashExpiresAt?: string;
}>;

const STORAGE_KEY = "buy-local-sparta-cart-v1";
const CartContext = createContext<CartContextValue | null>(null);
function displayMoney(minor: number) { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }
function safeQuantityCap(value: unknown): number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? Math.min(99, value) : 99; }

function storedCartItem(value: unknown): CartItem | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<CartItem>;
  const priceMinor = item.priceMinor;
  const quantity = item.quantity;
  if (typeof item.canonicalVariantId !== "string" || item.canonicalVariantId.length === 0 || item.canonicalVariantId.length > 128
    || typeof item.title !== "string" || item.title.length === 0 || item.title.length > 500
    || typeof item.price !== "string" || item.price.length > 64
    || typeof priceMinor !== "number" || !Number.isSafeInteger(priceMinor) || priceMinor < 0
    || typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0) return undefined;

  const flashExpiry = typeof item.flashExpiresAt === "string" ? Date.parse(item.flashExpiresAt) : Number.NaN;
  const flashActive = item.flashSale === true
    && Number.isFinite(flashExpiry)
    && flashExpiry > Date.now()
    && item.quantityCap === 1
    && typeof item.regularPriceMinor === "number"
    && Number.isSafeInteger(item.regularPriceMinor)
    && item.regularPriceMinor >= priceMinor;
  const quantityCap = flashActive ? 1 : 99;

  return {
    canonicalVariantId: item.canonicalVariantId,
    title: item.title,
    priceMinor,
    price: item.price,
    quantity: Math.min(quantityCap, quantity),
    ...(flashActive ? {
      regularPriceMinor: item.regularPriceMinor,
      flashSale: true,
      quantityCap: 1,
      flashExpiresAt: item.flashExpiresAt
    } : {})
  };
}

function persistentCartItem(item: CartItem) {
  return {
    canonicalVariantId: item.canonicalVariantId,
    title: item.title,
    priceMinor: item.priceMinor,
    price: item.price,
    quantity: item.quantity,
    ...(item.flashSale && item.quantityCap === 1 && item.flashExpiresAt ? {
      regularPriceMinor: item.regularPriceMinor,
      flashSale: true,
      quantityCap: 1,
      flashExpiresAt: item.flashExpiresAt
    } : {})
  };
}

function localStorageGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function localStorageSet(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* browser storage can be unavailable by policy */ }
}

function localStorageRemove(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* fail soft when browser storage is unavailable */ }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [detailsReady, setDetailsReady] = useState(false);
  const [persistentCsrf, setPersistentCsrf] = useState<string>();
  const [isCartOpen, setCartOpen] = useState(false);
  const [cartPulseKey, setCartPulseKey] = useState(0);
  const persistentEnabled = useRef(false);
  const initialMergeDone = useRef(false);
  const itemIdsKey = useMemo(() => items.map((item) => item.canonicalVariantId).sort().join("|"), [items]);
  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  useEffect(() => {
    let local: CartItem[] = [];
    const stored = localStorageGet(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) local = parsed.map(storedCartItem).filter((item): item is CartItem => Boolean(item));
        else localStorageRemove(STORAGE_KEY);
      } catch { localStorageRemove(STORAGE_KEY); }
    }
    setItems(local);
    void fetch("/api/account/cart", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { persistent?: boolean; csrfToken?: string; cart?: { items?: readonly ServerCartItem[] } | null };
      if (!body.persistent) return;
      persistentEnabled.current = true;
      setPersistentCsrf(body.csrfToken);
      const server: CartItem[] = (body.cart?.items ?? []).map((item) => {
        const quantityCap = safeQuantityCap(item.quantityCap);
        return {
          canonicalVariantId: item.canonicalVariantId,
          title: item.title,
          priceMinor: item.priceMinor,
          price: displayMoney(item.priceMinor),
          quantity: Math.min(quantityCap, item.quantity),
          regularPriceMinor: item.regularPriceMinor,
          flashSale: item.flashSale === true,
          quantityCap: item.quantityCap,
          flashExpiresAt: item.flashExpiresAt
        };
      });
      const merged = new Map<string, CartItem>();
      for (const item of server) merged.set(item.canonicalVariantId, item);
      for (const item of local) {
        const existing = merged.get(item.canonicalVariantId);
        if (!existing) {
          merged.set(item.canonicalVariantId, item);
          continue;
        }
        const cap = safeQuantityCap(existing.quantityCap);
        merged.set(item.canonicalVariantId, {
          ...item,
          ...existing,
          quantity: Math.min(cap, Math.max(existing.quantity, item.quantity)),
          title: existing.title,
          priceMinor: existing.priceMinor,
          price: displayMoney(existing.priceMinor),
          regularPriceMinor: existing.regularPriceMinor,
          flashSale: existing.flashSale,
          quantityCap: existing.quantityCap,
          flashExpiresAt: existing.flashExpiresAt
        });
      }
      setItems([...merged.values()]);
    }).catch(() => undefined).finally(() => { initialMergeDone.current = true; setHydrated(true); });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const richPresentationNeeded = isCartOpen || /^\/(?:cart|checkout)\/?$/.test(window.location.pathname);
    if (!itemIdsKey || !richPresentationNeeded) {
      setDetailsReady(true);
      return;
    }

    const controller = new AbortController();
    const ids = itemIdsKey.split("|").filter(Boolean);
    setDetailsReady(false);
    void fetch("/api/cart/details", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => response.ok ? response.json() as Promise<{ items?: readonly CartProductDetails[] }> : undefined)
      .then((body) => {
        if (!body?.items?.length) return;
        const details = new Map(body.items.map((item) => [item.canonicalVariantId, item]));
        setItems((current) => current.map((item) => {
          const detail = details.get(item.canonicalVariantId);
          return detail ? { ...item, ...detail } : item;
        }));
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Cart presentation details unavailable", error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailsReady(true);
      });
    return () => controller.abort();
  }, [hydrated, isCartOpen, itemIdsKey]);

  useEffect(() => {
    if (hydrated) localStorageSet(STORAGE_KEY, JSON.stringify(items.map(persistentCartItem)));
  }, [hydrated, items]);

  useEffect(() => {
    if (!hydrated || !initialMergeDone.current || !persistentEnabled.current || !persistentCsrf) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/account/cart", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": persistentCsrf },
        body: JSON.stringify({ items: items.map((item) => ({ canonicalVariantId: item.canonicalVariantId, quantity: item.quantity })) })
      }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hydrated, items, persistentCsrf]);

  const addItem = useCallback((item: Omit<CartItem, "quantity">, quantity = 1) => {
    if (!item.canonicalVariantId.trim() || !item.title.trim() || !Number.isSafeInteger(item.priceMinor) || item.priceMinor < 0) return;
    const incomingCap = safeQuantityCap(item.quantityCap);
    const safeQuantity = Math.max(1, Math.min(incomingCap, Number.isFinite(quantity) ? Math.trunc(quantity) : 1));
    setItems((current) => {
      const existing = current.find((entry) => entry.canonicalVariantId === item.canonicalVariantId);
      if (!existing) return [...current, { ...item, quantity: safeQuantity }];
      return current.map((entry) => {
        if (entry.canonicalVariantId !== item.canonicalVariantId) return entry;
        const nextIsFlash = item.flashSale === true || entry.flashSale === true;
        const cap = nextIsFlash ? 1 : Math.min(99, safeQuantityCap(item.quantityCap ?? entry.quantityCap));
        const flashSource = item.flashSale === true ? item : entry;
        return {
          ...entry,
          ...item,
          ...(nextIsFlash ? {
            priceMinor: flashSource.priceMinor,
            price: flashSource.price,
            regularPriceMinor: flashSource.regularPriceMinor,
            flashSale: true,
            quantityCap: 1,
            flashExpiresAt: flashSource.flashExpiresAt
          } : {}),
          quantity: Math.min(cap, entry.quantity + safeQuantity)
        };
      });
    });
    setCartPulseKey((current) => current + 1);
    setCartOpen(true);
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    if (!Number.isFinite(quantity)) return;
    const safe = Math.trunc(quantity);
    if (safe <= 0) return setItems((current) => current.filter((item) => item.canonicalVariantId !== id));
    setItems((current) => current.map((item) => item.canonicalVariantId === id
      ? { ...item, quantity: Math.min(safeQuantityCap(item.quantityCap), safe) }
      : item));
  }, []);

  const removeItem = useCallback((id: string) => setItems((current) => current.filter((item) => item.canonicalVariantId !== id)), []);
  const clear = useCallback(() => setItems([]), []);
  const value = useMemo(() => ({
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalMinor: items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0),
    addItem,
    setQuantity,
    removeItem,
    clear,
    hydrated,
    detailsReady,
    isCartOpen,
    openCart,
    closeCart,
    cartPulseKey
  }), [items, addItem, setQuantity, removeItem, clear, hydrated, detailsReady, isCartOpen, openCart, closeCart, cartPulseKey]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used within CartProvider");
  return value;
}
