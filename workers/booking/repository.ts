import type { BookingRequest } from '../../src/domain/booking/request.ts';

/** Structural subset of Cloudflare D1. No Node/database credentials in client bundles. */
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch<T>(statements: Statement[]): Promise<{ success: boolean; results: T[] }[]>;
}
export type Receipt = { requestId: string; receivedAt: number; status: 'pending' };
type Row = { id: string; payload_hash: string; received_at: number };
export class IdempotencyConflict extends Error {}

function receipt(row: Row): Receipt {
  return { requestId: row.id, receivedAt: row.received_at, status: 'pending' };
}
export class D1BookingRepository {
  private db: Database;
  constructor(db: Database) { this.db = db; }

  async find(keyHash: string, payloadHash: string): Promise<Receipt | null> {
    const row = await this.db.prepare('SELECT id, payload_hash, received_at FROM booking_requests WHERE idempotency_hash = ?')
      .bind(keyHash).first<Row>();
    if (!row) return null;
    if (row.payload_hash !== payloadHash) throw new IdempotencyConflict();
    return receipt(row);
  }

  async save(request: BookingRequest, keyHash: string, payloadHash: string, now: number): Promise<Receipt> {
    const id = crypto.randomUUID();
    // D1 batch is transactional: any failed statement rolls back the whole batch.
    // The UNIQUE key arbitrates concurrent attempts, without reserving event dates.
    const result = await this.db.batch<Row>([
      this.db.prepare(`INSERT INTO booking_requests
        (id, idempotency_hash, payload_hash, request_json, received_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(idempotency_hash) DO NOTHING`)
        .bind(id, keyHash, payloadHash, JSON.stringify(request), now),
      this.db.prepare(`INSERT INTO booking_outbox (booking_id, kind, created_at)
        SELECT id, 'booking_received', received_at FROM booking_requests WHERE id = ?`).bind(id),
      this.db.prepare('SELECT id, payload_hash, received_at FROM booking_requests WHERE idempotency_hash = ?').bind(keyHash),
    ]);
    if (result.length !== 3 || result.some(r => !r.success) || result[2].results.length !== 1) throw new Error('Persistence failed');
    const row = result[2].results[0];
    if (row.payload_hash !== payloadHash) throw new IdempotencyConflict();
    return receipt(row);
  }
}
