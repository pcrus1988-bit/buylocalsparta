export const TRY_ON_MODEL_PREFIX = "km:try-on:model:v2:";
export const TRY_ON_PREVIEW_PREFIX = "km:try-on:preview:v2:";
export const TRY_ON_ACTIVE_SCOPE_KEY = "km:try-on:active-scope:v2";
export const TRY_ON_LEGACY_MODEL_KEY = "km:try-on:model:v1";
export const TRY_ON_LEGACY_PREVIEW_PREFIX = "km:try-on:preview:v1:";

export type TryOnBrowserStorage = Readonly<{
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}>;

function shouldClearTryOnKey(key: string): boolean {
  return key === TRY_ON_ACTIVE_SCOPE_KEY
    || key === TRY_ON_LEGACY_MODEL_KEY
    || key.startsWith(TRY_ON_MODEL_PREFIX)
    || key.startsWith(TRY_ON_PREVIEW_PREFIX)
    || key.startsWith(TRY_ON_LEGACY_PREVIEW_PREFIX);
}

function defaultStorage(kind: "localStorage" | "sessionStorage"): TryOnBrowserStorage | undefined {
  const root = globalThis as typeof globalThis & Partial<Record<"localStorage" | "sessionStorage", TryOnBrowserStorage>>;
  try {
    return root[kind];
  } catch {
    return undefined;
  }
}

function clearStorage(storage: TryOnBrowserStorage | undefined): number {
  if (!storage) return 0;
  let removed = 0;
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key || !shouldClearTryOnKey(key)) continue;
      storage.removeItem(key);
      removed += 1;
    }
  } catch {
    // Browser privacy/quota policies can make Web Storage inaccessible.
  }
  return removed;
}

export function clearCustomerTryOnBrowserStorage(input: {
  localStorage?: TryOnBrowserStorage;
  sessionStorage?: TryOnBrowserStorage;
} = {}): number {
  return clearStorage(input.localStorage ?? defaultStorage("localStorage"))
    + clearStorage(input.sessionStorage ?? defaultStorage("sessionStorage"));
}
