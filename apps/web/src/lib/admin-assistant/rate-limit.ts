const windows = new Map<string, { startedAt: number; count: number }>();

export function consumeAdminAssistantRateLimit(userId: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
  const windowMs = 60_000;
  const limit = 30;
  const current = windows.get(userId);
  if (!current || now - current.startedAt >= windowMs) {
    windows.set(userId, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (current.count >= limit) return { allowed: false, retryAfterMs: Math.max(1, windowMs - (now - current.startedAt)) };
  current.count += 1;
  if (windows.size > 1_000) {
    for (const [key, value] of windows) if (now - value.startedAt >= windowMs) windows.delete(key);
  }
  return { allowed: true, retryAfterMs: 0 };
}
