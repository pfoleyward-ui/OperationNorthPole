-- Preserve immutable Phase 5 receipts; operational state is separate.
CREATE TABLE hq_bookings (
  booking_id TEXT PRIMARY KEY NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','under_review','alternative_proposed','awaiting_customer_acceptance','confirmed','declined','canceled','completed')),
  version INTEGER NOT NULL CHECK (version >= 1),
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  source TEXT NOT NULL CHECK (source IN ('customer','phone','text','facebook')),
  last_operation TEXT NOT NULL
);
CREATE TABLE hq_operations (
  operation_id TEXT PRIMARY KEY NOT NULL,
  command_hash TEXT NOT NULL,
  booking_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  actor_sub TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('santa','backup')),
  action TEXT NOT NULL,
  channel TEXT,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  occurred_at INTEGER NOT NULL
);
CREATE TABLE hq_staffing (
  booking_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  quote_id TEXT NOT NULL,
  quote_revision INTEGER NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL CHECK (end > start),
  attendant_ref TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  PRIMARY KEY (booking_id, quote_id, quote_revision)
);
CREATE TABLE hq_reservations (
  booking_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  resource TEXT NOT NULL CHECK (resource IN ('santa','photo-booth','booth-attendant')),
  start INTEGER NOT NULL,
  end INTEGER NOT NULL CHECK (end > start),
  PRIMARY KEY (booking_id, resource)
);
CREATE INDEX hq_reservation_overlap ON hq_reservations(resource, start, end);
CREATE TABLE hq_unavailable (
  id TEXT PRIMARY KEY NOT NULL,
  resource TEXT NOT NULL CHECK (resource IN ('santa','photo-booth','booth-attendant')),
  start INTEGER NOT NULL,
  end INTEGER NOT NULL CHECK (end > start),
  actor_sub TEXT NOT NULL
);
CREATE INDEX hq_unavailable_overlap ON hq_unavailable(resource,start,end);
CREATE TABLE hq_resource_operations (
  operation_id TEXT PRIMARY KEY NOT NULL,
  command_hash TEXT NOT NULL,
  resource_block_id TEXT NOT NULL,
  actor_sub TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('santa','backup')),
  action TEXT NOT NULL CHECK (action IN ('block','release')),
  occurred_at INTEGER NOT NULL
);
CREATE TRIGGER hq_no_double_reservation BEFORE INSERT ON hq_reservations BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM hq_reservations WHERE resource = NEW.resource AND booking_id <> NEW.booking_id AND start < NEW.end AND end > NEW.start
  ) OR EXISTS (
    SELECT 1 FROM hq_unavailable WHERE resource = NEW.resource AND start < NEW.end AND end > NEW.start
  ) THEN RAISE(ABORT, 'hq_resource_conflict') END;
  SELECT CASE WHEN NEW.resource = 'booth-attendant' AND NOT EXISTS (
    SELECT 1 FROM hq_staffing s JOIN hq_bookings b ON b.booking_id = s.booking_id
    WHERE s.booking_id = NEW.booking_id
      AND s.quote_id = json_extract(b.state_json, '$.quote.id')
      AND s.quote_revision = json_extract(b.state_json, '$.quote.revision')
      AND s.start = json_extract(b.state_json, '$.quote.start')
      AND s.end = json_extract(b.state_json, '$.quote.end')
  ) THEN RAISE(ABORT, 'hq_staffing_required') END;
END;
CREATE TRIGGER hq_unavailability_guard BEFORE INSERT ON hq_unavailable BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM hq_reservations WHERE resource = NEW.resource AND start < NEW.end AND end > NEW.start
  ) THEN RAISE(ABORT, 'hq_resource_conflict') END;
END;
CREATE TABLE hq_event_outbox (
  operation_id TEXT PRIMARY KEY NOT NULL REFERENCES hq_operations(operation_id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('booking_changed','elf_invitation_prepared')),
  created_at INTEGER NOT NULL
);
-- Metadata only. No token, notes, child fields, recipient data or delivery worker.
CREATE TABLE hq_elf_invitation_plans (
  booking_id TEXT PRIMARY KEY NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  prepared_at INTEGER NOT NULL,
  prepared_by TEXT NOT NULL,
  collection_enabled INTEGER NOT NULL DEFAULT 0 CHECK (collection_enabled = 0)
);
CREATE TRIGGER hq_elf_eligibility BEFORE INSERT ON hq_elf_invitation_plans BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM hq_bookings WHERE booking_id = NEW.booking_id AND status = 'confirmed'
      AND json_extract(state_json,'$.serviceId') = 'home-visits'
  ) THEN RAISE(ABORT, 'hq_elf_ineligible') END;
END;
