CREATE TABLE integration_cycles (
  id TEXT PRIMARY KEY NOT NULL,
  booking_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  confirmed_at INTEGER NOT NULL,
  ack_due INTEGER,
  level1_sent_at INTEGER,
  state TEXT NOT NULL CHECK (state IN ('active','resolved')),
  acknowledged_at INTEGER,
  acknowledged_by TEXT,
  resolved_reason TEXT
);
CREATE INDEX integration_cycle_booking ON integration_cycles(booking_id);
CREATE TABLE integration_plans (
  booking_id TEXT PRIMARY KEY NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  booking_version INTEGER NOT NULL,
  cycle_id TEXT,
  calendar_hash TEXT,
  policy_hash TEXT NOT NULL,
  required_job_ids TEXT NOT NULL CHECK (json_valid(required_job_ids)),
  planned_at INTEGER NOT NULL
);
CREATE TABLE integration_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  booking_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES integration_cycles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('calendar','new_request','confirmation','seven_days','twenty_four_hours','three_hours','morning','escalation_2','escalation_3','escalation_4','resolution')),
  recipient TEXT NOT NULL CHECK (recipient IN ('google','santa','mrs_claus','technical_admin')),
  target_key TEXT,
  channel TEXT CHECK (channel IN ('email','sms')),
  calendar_hash TEXT,
  due_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  next_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued','sending','retry','unknown','accepted','delivered','canceled','expired','blocked','failed','uncertain')),
  attempts INTEGER NOT NULL DEFAULT 0,
  claim_token TEXT,
  claim_until INTEGER,
  dispatched_at INTEGER,
  accepted_at INTEGER,
  provider_id TEXT,
  payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)),
  error_code TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX integration_job_due ON integration_jobs(state,next_at);
CREATE INDEX integration_job_booking ON integration_jobs(booking_id,cycle_id);
CREATE TABLE integration_acknowledgments (
  cycle_id TEXT PRIMARY KEY NOT NULL REFERENCES integration_cycles(id) ON DELETE CASCADE,
  actor_sub TEXT NOT NULL,
  occurred_at INTEGER NOT NULL
);
CREATE TABLE integration_outbox_receipts (
  source TEXT NOT NULL CHECK (source IN ('intake','hq')),
  source_id TEXT NOT NULL,
  booking_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  processed_at INTEGER NOT NULL,
  PRIMARY KEY (source,source_id)
);
CREATE TABLE integration_control (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE integration_leases (
  key TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE integration_calendar (
  booking_id TEXT PRIMARY KEY NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  incarnation INTEGER NOT NULL DEFAULT 0,
  synced_hash TEXT,
  checked_at INTEGER NOT NULL,
  error_code TEXT
);
-- OAuth secrets and PKCE verifiers are encrypted with external AES-GCM keys.
CREATE TABLE integration_google (
  id TEXT PRIMARY KEY NOT NULL CHECK (id='google'),
  owner_sub TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('connected','disconnected','revocation_pending')),
  encrypted_tokens TEXT,
  calendar_id TEXT,
  calendar_state TEXT NOT NULL CHECK (calendar_state IN ('missing','creating','ready','uncertain')),
  setup_nonce TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE integration_oauth_states (
  state_hash TEXT PRIMARY KEY NOT NULL,
  owner_sub TEXT NOT NULL,
  encrypted_verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
