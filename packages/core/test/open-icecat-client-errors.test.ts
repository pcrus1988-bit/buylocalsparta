import assert from "node:assert/strict";
import test from "node:test";
import {
  OpenIcecatClient,
  OpenIcecatRequestError,
  type OpenIcecatErrorDisposition
} from "../src/ingestion/open-icecat/index.ts";

const GTIN = "4006381333931";

async function expectRequestError(
  client: OpenIcecatClient,
  disposition: OpenIcecatErrorDisposition,
  status?: number
): Promise<void> {
  await assert.rejects(
    () => client.lookupByGtin(GTIN),
    (error: unknown) => {
      assert.ok(error instanceof OpenIcecatRequestError);
      assert.equal(error.disposition, disposition);
      assert.equal(error.status, status);
      return true;
    }
  );
}

test("classifies HTTP 429 as retryable", async () => {
  const client = new OpenIcecatClient({
    username: "test-user",
    apiToken: "test-token",
    fetch: async () => new Response(JSON.stringify({ Errors: "rate limited" }), { status: 429 })
  });

  await expectRequestError(client, "retry", 429);
});

test("classifies HTTP 404 as a permanent product skip", async () => {
  const client = new OpenIcecatClient({
    username: "test-user",
    apiToken: "test-token",
    fetch: async () => new Response(JSON.stringify({ ContentErrors: "Product not found" }), { status: 404 })
  });

  await expectRequestError(client, "skip", 404);
});

test("classifies HTTP 401 as a fatal provider configuration error", async () => {
  const client = new OpenIcecatClient({
    username: "test-user",
    apiToken: "bad-token",
    fetch: async () => new Response(JSON.stringify({ ContentErrors: "Unauthorized API token" }), { status: 401 })
  });

  await expectRequestError(client, "fatal", 401);
});

test("classifies explicit 2xx missing-product content errors as skips", async () => {
  const client = new OpenIcecatClient({
    username: "test-user",
    apiToken: "test-token",
    fetch: async () => new Response(JSON.stringify({
      data: { ContentErrors: [{ Message: "Product not found for supplied GTIN" }] }
    }), { status: 200 })
  });

  await expectRequestError(client, "skip", 200);
});

test("classifies request transport failures as retryable", async () => {
  const client = new OpenIcecatClient({
    username: "test-user",
    apiToken: "test-token",
    fetch: async () => {
      throw new TypeError("socket closed before response");
    }
  });

  await expectRequestError(client, "retry");
});
