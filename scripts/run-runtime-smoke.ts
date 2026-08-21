if (process.env.NODE_ENV === "production") {
  throw new Error("Runtime smoke harness must never enable demo personalization in production");
}

// The end-to-end smoke intentionally represents a customer who opted into
// personalization. Real/new accounts remain OFF by default; this signal exists
// only for the isolated development server spawned by dev/smoke.ts.
process.env.BLS_DEV_SMOKE_PERSONALIZATION = "true";

await import("../dev/smoke.ts");
