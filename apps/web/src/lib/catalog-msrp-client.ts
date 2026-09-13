"use client";

type CatalogMsrpRequest = Readonly<{
  productId: string;
  vendorId: string;
  retailPriceMinor: number;
}>;

type CatalogMsrpResponseItem = CatalogMsrpRequest & Readonly<{ msrpMinor?: number }>;

type QueueEntry = Readonly<{
  request: CatalogMsrpRequest;
  resolve: (value: number | undefined) => void;
}>;

const queue = new Map<string, QueueEntry[]>();
let flushScheduled = false;

function requestKey(request: CatalogMsrpRequest): string {
  return `${request.productId}\u0000${request.vendorId}\u0000${request.retailPriceMinor}`;
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    void flushQueue();
  });
}

async function flushQueue() {
  if (!queue.size) return;

  const current = [...queue.entries()];
  queue.clear();
  const requests = current.map(([, entries]) => entries[0].request);

  try {
    const response = await fetch("/api/catalog/msrp/batch", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({ items: requests })
    });
    if (!response.ok) throw new Error(`MSRP batch request failed: ${response.status}`);

    const payload = await response.json() as { items?: CatalogMsrpResponseItem[] };
    const values = new Map<string, number | undefined>();
    for (const item of payload.items ?? []) {
      const value = Number(item.msrpMinor);
      values.set(
        requestKey(item),
        Number.isSafeInteger(value) && value > item.retailPriceMinor ? value : undefined
      );
    }

    for (const [key, entries] of current) {
      const value = values.get(key);
      for (const entry of entries) entry.resolve(value);
    }
  } catch {
    for (const [, entries] of current) {
      for (const entry of entries) entry.resolve(undefined);
    }
  }

  if (queue.size) scheduleFlush();
}

/**
 * All card effects mounted in the same render are collected into one request.
 * This replaces the previous one-HTTP-request-per-card pattern while keeping the
 * existing client-side MSRP presentation compatible with older catalogue callers.
 */
export function requestCatalogMsrp(request: CatalogMsrpRequest): Promise<number | undefined> {
  return new Promise((resolve) => {
    const key = requestKey(request);
    const entries = queue.get(key) ?? [];
    queue.set(key, [...entries, { request, resolve }]);
    scheduleFlush();
  });
}
