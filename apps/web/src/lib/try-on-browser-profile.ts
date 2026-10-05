"use client";

import {
  TRY_ON_ACTIVE_SCOPE_KEY,
  TRY_ON_AUTO_PREFIX,
  TRY_ON_MODEL_PREFIX,
  TRY_ON_PREVIEW_PREFIX
} from "./try-on-browser-storage";

const MAX_MODEL_DATA_URL_CHARS = 3_450_000;

function modelKey(scope: string): string {
  return `${TRY_ON_MODEL_PREFIX}${scope}`;
}

function autoKey(scope: string): string {
  return `${TRY_ON_AUTO_PREFIX}${scope}`;
}

function validModel(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized?.startsWith("data:image/") ? normalized : undefined;
}

export function readTryOnModelPhoto(scope: string): string | undefined {
  const key = modelKey(scope);
  try {
    const persistent = validModel(window.localStorage.getItem(key));
    if (persistent) return persistent;
  } catch {}
  try {
    return validModel(window.sessionStorage.getItem(key));
  } catch {
    return undefined;
  }
}

export function storeTryOnModelPhoto(scope: string, value: string): void {
  const key = modelKey(scope);
  try {
    window.localStorage.setItem(key, value);
    try { window.sessionStorage.removeItem(key); } catch {}
    return;
  } catch {}
  try { window.sessionStorage.setItem(key, value); } catch {}
}

export function removeTryOnModelPhoto(scope: string): void {
  const key = modelKey(scope);
  try { window.localStorage.removeItem(key); } catch {}
  try { window.sessionStorage.removeItem(key); } catch {}
}

export function readTryOnAutoMode(scope: string): boolean {
  const key = autoKey(scope);
  try {
    const value = window.localStorage.getItem(key);
    if (value) return value !== "off";
  } catch {}
  try {
    return window.sessionStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
}

export function storeTryOnAutoMode(scope: string, enabled: boolean): void {
  const key = autoKey(scope);
  const value = enabled ? "on" : "off";
  try {
    window.localStorage.setItem(key, value);
    try { window.sessionStorage.removeItem(key); } catch {}
    return;
  } catch {}
  try { window.sessionStorage.setItem(key, value); } catch {}
}

export function clearTryOnPreviewsForScope(scope: string): void {
  const prefix = `${TRY_ON_PREVIEW_PREFIX}${scope}:`;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(prefix)) window.sessionStorage.removeItem(key);
    }
  } catch {}
}

function removeTryOnAutoMode(scope: string): void {
  const key = autoKey(scope);
  try { window.localStorage.removeItem(key); } catch {}
  try { window.sessionStorage.removeItem(key); } catch {}
}

function clearScope(scope: string): void {
  removeTryOnModelPhoto(scope);
  removeTryOnAutoMode(scope);
  clearTryOnPreviewsForScope(scope);
}

function activeScope(): string | undefined {
  try {
    const value = window.localStorage.getItem(TRY_ON_ACTIVE_SCOPE_KEY)?.trim();
    if (value) return value;
  } catch {}
  try {
    return window.sessionStorage.getItem(TRY_ON_ACTIVE_SCOPE_KEY)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function reconcileTryOnBrowserScope(nextScope: string | undefined): void {
  const previous = activeScope();
  if (previous && previous !== nextScope) clearScope(previous);

  if (!nextScope) {
    try { window.localStorage.removeItem(TRY_ON_ACTIVE_SCOPE_KEY); } catch {}
    try { window.sessionStorage.removeItem(TRY_ON_ACTIVE_SCOPE_KEY); } catch {}
    return;
  }

  try {
    window.localStorage.setItem(TRY_ON_ACTIVE_SCOPE_KEY, nextScope);
    try { window.sessionStorage.removeItem(TRY_ON_ACTIVE_SCOPE_KEY); } catch {}
    return;
  } catch {}
  try { window.sessionStorage.setItem(TRY_ON_ACTIVE_SCOPE_KEY, nextScope); } catch {}
}

export async function normalizeTryOnModelPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("INVALID_TRY_ON_IMAGE");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1296 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("INVALID_TRY_ON_IMAGE");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.92, 0.88, 0.84, 0.8, 0.76, 0.7, 0.64]) {
      const encoded = canvas.toDataURL("image/jpeg", quality);
      if (encoded.length <= MAX_MODEL_DATA_URL_CHARS) return encoded;
    }
    throw new Error("TRY_ON_IMAGE_TOO_LARGE");
  } finally {
    bitmap.close();
  }
}
