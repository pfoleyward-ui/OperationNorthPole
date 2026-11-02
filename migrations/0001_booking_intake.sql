PRAGMA foreign_keys = ON;

CREATE TABLE booking_requests (
  id TEXT PRIMARY KEY NOT NULL,
  idempotency_hash TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status = 'pending'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  received_at INTEGER NOT NULL
);

-- Durable future work marker only: no notification consumer is activated.
CREATE TABLE booking_outbox (
  booking_id TEXT PRIMARY KEY NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind = 'booking_received'),
  created_at INTEGER NOT NULL
);

-- IP addresses are never stored; keys are HMACs scoped to a minute.
CREATE TABLE intake_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX intake_rate_expiry ON intake_rate_limits(expires_at);
