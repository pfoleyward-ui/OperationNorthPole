-- Optional child preparation data is isolated from booking/calendar/email payloads.
CREATE TABLE elf_invitations (
 booking_id TEXT PRIMARY KEY REFERENCES booking_requests(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE elf_notes (
 booking_id TEXT PRIMARY KEY REFERENCES booking_requests(id) ON DELETE CASCADE,
 ciphertext TEXT NOT NULL,
 version INTEGER NOT NULL,
 consent_version TEXT NOT NULL,
 consent_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE elf_alerts (
 id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 delivered_at INTEGER
);
CREATE TABLE elf_rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TRIGGER elf_arrival_insert AFTER INSERT ON elf_notes BEGIN
 INSERT INTO elf_alerts (id,booking_id,created_at) VALUES (lower(hex(randomblob(16))),NEW.booking_id,NEW.updated_at);
END;
CREATE TRIGGER elf_arrival_update AFTER UPDATE ON elf_notes BEGIN
 INSERT INTO elf_alerts (id,booking_id,created_at) VALUES (lower(hex(randomblob(16))),NEW.booking_id,NEW.updated_at);
END;
