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
}>;

type CartProductDetails = Readonly<{
  canonicalVariantId: string;
  imageUrl?: string;
  imageAlt?: string;
  sku?: string;
  gtin?: string;
  color?: string;
  size?: string;
}>;

const STORAGE_KEY = "buy-local-sparta-cart-v1";
const CartContext = createContext<CartContextValue | null>(null);
function displayMoney(minor: number) { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }

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
  return {
    canonicalVariantId: item.canonicalVariantId,
    title: item.title,
    priceMinor,
    price: item.price,
    quantity: Math.min(99, quantity)
  };
}

function persistentCartItem(item: CartItem) {
  return {
    canonicalVariantId: item.canonicalVariantId,
    title: item.title,
    priceMinor: item.priceMinor,
    price: item.price,
    quantity: item.quantity
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
  const [persistentCsrf, setPersistentCsrf] = useState<string>();
  const persistentEnabled = useRef(false);
  const initialMergeDone = useRef(false);
  const itemIdsKey = useMemo(() => items.map((item) => item.canonicalVariantId).sort().join("|"), [items]);

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
      const body = await response.json() as { persistent?: boolean; csrfToken?: string; cart?: { items?: readonly { canonicalVariantId: string; title: string; priceMinor: number; quantity: number }[] } | null };
      if (!body.persistent) return;
      persistentEnabled.current = true;
      setPersistentCsrf(body.csrfToken);
      const server = (body.cart?.items ?? []).map((item) => ({ canonicalVariantId: item.canonicalVariantId, title: item.title, priceMinor: item.priceMinor, price: displayMoney(item.priceMinor), quantity: Math.min(99, item.quantity) }));
      const merged = new Map<string, CartItem>();
      for (const item of server) merged.set(item.canonicalVariantId, item);
      for (const item of local) {
        const existing = merged.get(item.canonicalVariantId);
        merged.set(item.canonicalVariantId, existing ? { ...item, quantity: Math.max(existing.quantity, item.quantity), title: existing.title, priceMinor: existing.priceMinor, price: existing.price } : item);
      }
      setItems([...merged.values()]);
    }).catch(() => undefined).finally(() => { initialMergeDone.current = true; setHydrated(true); });
  }, []);

  useEffect(() => {
    if (!hydrated || !itemIdsKey || !/^\/(?:cart|checkout)\/?$/.test(window.location.pathname)) return;
    const controller = new AbortController();
    const ids = itemIdsKey.split("|").filter(Boolean);
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
      .catch(() => undefined);
    return () => controller.abort();
  }, [hydrated, itemIdsKey]);

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
    const safeQuantity = Math.max(1, Math.min(99, Number.isFinite(quantity) ? Math.trunc(quantity) : 1));
    setItems((current) => {
      const existing = current.find((entry) => entry.canonicalVariantId === item.canonicalVariantId);
      if (!existing) return [...current, { ...item, quantity: safeQuantity }];
      return current.map((entry) => entry.canonicalVariantId === item.canonicalVariantId ? { ...entry, ...item, quantity: Math.min(99, entry.quantity + safeQuantity) } : entry);
    });
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    if (!Number.isFinite(quantity)) return;
    const safe = Math.trunc(quantity);
    if (safe <= 0) return setItems((current) => current.filter((item) => item.canonicalVariantId !== id));
    setItems((current) => current.map((item) => item.canonicalVariantId === id ? { ...item, quantity: Math.min(99, safe) } : item));
  }, []);

  const removeItem = useCallback((id: string) => setItems((current) => current.filter((item) => item.canonicalVariantId !== id)), []);
  const clear = useCallback(() => setItems([]), []);
  const value = useMemo(() => ({ items, count: items.reduce((sum, item) => sum + item.quantity, 0), subtotalMinor: items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0), addItem, setQuantity, removeItem, clear, hydrated }), [items, addItem, setQuantity, removeItem, clear, hydrated]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used within CartProvider");
  return value;
}
