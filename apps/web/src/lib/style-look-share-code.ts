const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bytesFromUuid(uuid: string): Uint8Array | undefined {
  const normalized = uuid.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) return undefined;
  const hex = normalized.replaceAll("-", "");
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]{20,24}$/.test(value)) return undefined;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    if (binary.length !== 16) return undefined;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

function uuidFromBytes(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

export function styleLookShareCodeFromToken(token: string): string | undefined {
  const bytes = bytesFromUuid(token);
  return bytes ? base64UrlEncode(bytes) : undefined;
}

export function styleLookShareTokenFromCode(code: string): string | undefined {
  const candidate = code.trim();
  if (UUID_PATTERN.test(candidate)) return candidate.toLowerCase();
  const bytes = base64UrlDecode(candidate);
  return bytes ? uuidFromBytes(bytes) : undefined;
}
