import { getDB } from './db';
import { ImportSession, ImportRowResult } from '@/types/import';

export const historyRepo = {
  async saveSession(session: ImportSession): Promise<void> {
    const db = await getDB();
    await db.put('sessions', session);
  },

  async getSessions(): Promise<ImportSession[]> {
    const db = await getDB();
    const tx = db.transaction('sessions', 'readonly');
    const index = tx.store.index('by-date');
    const sessions = await index.getAll();
    // Return newest first
    return sessions.reverse();
  },

  async getSessionById(id: string): Promise<ImportSession | undefined> {
    const db = await getDB();
    return db.get('sessions', id);
  },

  async deleteSession(id: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(['sessions', 'rows'], 'readwrite');
    await tx.objectStore('sessions').delete(id);

    // Delete associated rows
    const rowStore = tx.objectStore('rows');
    const index = rowStore.index('by-session');
    let cursor = await index.openCursor(IDBKeyRange.only(id));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  },

  async saveRows(rows: ImportRowResult[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('rows', 'readwrite');
    for (const row of rows) {
      await tx.store.add(row);
    }
    await tx.done;
  },

  async getRowsBySessionId(sessionId: string): Promise<ImportRowResult[]> {
    const db = await getDB();
    const tx = db.transaction('rows', 'readonly');
    const index = tx.store.index('by-session');
    return index.getAll(IDBKeyRange.only(sessionId));
  },

  async getFailedRows(sessionId: string): Promise<ImportRowResult[]> {
    const rows = await this.getRowsBySessionId(sessionId);
    return rows.filter((r) => r.status === 'FAILED');
  },

  async getOverallStats(): Promise<{
    totalImported: number;
    totalFailed: number;
    totalSessions: number;
    recentSessions: ImportSession[];
  }> {
    const sessions = await this.getSessions();
    let totalImported = 0;
    let totalFailed = 0;

    for (const s of sessions) {
      totalImported += s.successfulRows;
      totalFailed += s.failedRows;
    }

    return {
      totalImported,
      totalFailed,
      totalSessions: sessions.length,
      recentSessions: sessions.slice(0, 5),
    };
  },
};

