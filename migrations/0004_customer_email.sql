-- Preserve existing receipts while extending the durable queue for customer email.
CREATE TABLE integration_jobs_email (
  id TEXT PRIMARY KEY NOT NULL,
  booking_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES integration_cycles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('calendar','new_request','confirmation','seven_days','twenty_four_hours','three_hours','morning','escalation_2','escalation_3','escalation_4','resolution','customer_update')),
  recipient TEXT NOT NULL CHECK (recipient IN ('google','santa','mrs_claus','technical_admin','customer')),
  target_key TEXT,
  -- Historical channel values are retained for receipts; dispatch is email-only.
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
INSERT INTO integration_jobs_email SELECT * FROM integration_jobs;
DROP TABLE integration_jobs;
ALTER TABLE integration_jobs_email RENAME TO integration_jobs;
CREATE INDEX integration_job_due ON integration_jobs(state,next_at);
CREATE INDEX integration_job_booking ON integration_jobs(booking_id,cycle_id);
