import type { Config } from '../config';
import { DEFAULT_CONFIG } from '../config';

// localStorageのキー
const STORAGE_KEY = 'mophrase:config';

// 保存対象のフィールド（keyframePromptは動的に読み込むため除外）
type PersistentConfigFields = Omit<Config, 'keyframePrompt'>;

// 設定をlocalStorageに保存
export const saveConfig = (config: Config): void => {
  try {
    const { keyframePrompt: _, ...persistentFields } = config;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentFields));
  } catch (error) {
    console.warn('[config] Failed to save config to localStorage:', error);
  }
};

// localStorageから設定を読み込み（デフォルト値とマージ）
export const loadConfig = (): Config => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_CONFIG };

    const parsed = JSON.parse(stored) as Partial<PersistentConfigFields>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch (error) {
    console.warn('[config] Failed to load config from localStorage:', error);
    return { ...DEFAULT_CONFIG };
  }
};
