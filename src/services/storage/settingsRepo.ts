import { getDB } from './db';
import { AppSettings, DEFAULT_SETTINGS } from '@/types/settings';

const SETTINGS_KEY = 'user_app_settings';

export const settingsRepo = {
  async getSettings(): Promise<AppSettings> {
    try {
      const db = await getDB();
      const stored = (await db.get('settings', SETTINGS_KEY)) as AppSettings | undefined;
      if (!stored) {
        return { ...DEFAULT_SETTINGS };
      }
      return { ...DEFAULT_SETTINGS, ...stored };
    } catch (e) {
      console.warn('Failed to load settings from DB, using defaults', e);
      return { ...DEFAULT_SETTINGS };
    }
  },

  async saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated: AppSettings = { ...current, ...settings };
    const db = await getDB();
    await db.put('settings', { key: SETTINGS_KEY, ...updated });
    return updated;
  },
};
