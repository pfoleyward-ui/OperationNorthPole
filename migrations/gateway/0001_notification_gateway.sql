-- Separate private gateway database: no customer booking data or child notes.
CREATE TABLE gateway_deliveries (
  id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  destination TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('retry','sending','accepted','delivered','failed','uncertain')),
  provider_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  error_code TEXT
);
CREATE INDEX gateway_receipt_poll ON gateway_deliveries(state,next_at);

CREATE TABLE gateway_webhook_receipts (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);
