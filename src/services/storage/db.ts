import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { ImportSession, ImportRowResult } from '@/types/import';
import { AppSettings } from '@/types/settings';

const DB_NAME = 'JiraSubtaskManagerDB';
const DB_VERSION = 1;

export interface JiraImportDBSchema extends DBSchema {
  sessions: {
    key: string;
    value: ImportSession;
    indexes: { 'by-date': string };
  };
  rows: {
    key: number;
    value: ImportRowResult;
    indexes: {
      'by-session': string;
      'by-status': string;
      'by-story': string;
    };
  };
  settings: {
    key: string;
    value: AppSettings | unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<JiraImportDBSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<JiraImportDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<JiraImportDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Store for import sessions
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('by-date', 'importDate');
        }

        // Store for individual row results
        if (!db.objectStoreNames.contains('rows')) {
          const rowStore = db.createObjectStore('rows', {
            keyPath: 'id',
            autoIncrement: true,
          });
          rowStore.createIndex('by-session', 'sessionId');
          rowStore.createIndex('by-status', 'status');
          rowStore.createIndex('by-story', 'storyKey');
        }

        // Store for user preferences
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}
