BEGIN;

-- Bind an idempotency key to the exact authenticated checkout request that first
-- claims it. The guard deliberately stores only hashes: no email, phone, address,
-- locker label or other customer content is persisted here.
CREATE TABLE checkout_request_guards (
  checkout_key text PRIMARY KEY
    CONSTRAINT checkout_request_guards_key_length_check CHECK (length(checkout_key) BETWEEN 16 AND 128),
  actor_hash text NOT NULL
    CONSTRAINT checkout_request_guards_actor_hash_check CHECK (actor_hash ~ '^[a-f0-9]{64}$'),
  request_hash text NOT NULL
    CONSTRAINT checkout_request_guards_request_hash_check CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE checkout_request_guards IS
  'Server-only replay-integrity guard. Stores SHA-256 actor/request fingerprints so a checkout key cannot be replayed with different fulfilment or recipient instructions.';

REVOKE ALL PRIVILEGES ON TABLE checkout_request_guards FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE checkout_request_guards TO bls_app_runtime, bls_platform_runtime;

COMMIT;
