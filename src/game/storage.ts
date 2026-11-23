import { FurnaceState, GameMode, GameSettings, ItemStack, WorldSaveMeta } from './types';

export interface WorldSavePayload {
  meta: WorldSaveMeta;
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    health: number;
    hunger: number;
    air: number;
    xpLevel: number;
    xpProgress: number;
    isFlying: boolean;
    spawnX: number;
    spawnY: number;
    spawnZ: number;
    timeOfDay: number;
    dayCount: number;
  };
  hotbar: (ItemStack | null)[];
  inventory: (ItemStack | null)[];
  armor: (ItemStack | null)[];
  offhand: ItemStack | null;
  blockEdits: [string, number][];
  blockRotations: [string, number][];
  chests: [string, (ItemStack | null)[]][];
  furnaces: [string, FurnaceState][];
}

const DB_NAME = 'nexora_craft_db';
const DB_VERSION = 1;
const STORE_WORLDS = 'worlds';
const SETTINGS_KEY = 'nexora_craft_settings_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  renderDistance: 3,
  shadows: true,
  weatherParticles: true,
  showFps: true,
  fov: 74,
  sensitivity: 1.0,
  touchControls:
    typeof window !== 'undefined' &&
    ('ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia?.('(pointer: coarse)').matches === true),
  muted: false,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota issues
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_WORLDS)) {
        db.createObjectStore(STORE_WORLDS, { keyPath: 'meta.id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveWorldToDB(payload: WorldSavePayload): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_WORLDS, 'readwrite');
      tx.objectStore(STORE_WORLDS).put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Fallback to localStorage for environments without IndexedDB
    try {
      localStorage.setItem(`nexora_world_${payload.meta.id}`, JSON.stringify(payload));
    } catch {
      // Ignore quota
    }
  }
}

export async function loadWorldFromDB(worldId: string): Promise<WorldSavePayload | null> {
  try {
    const db = await openDB();
    const res = await new Promise<WorldSavePayload | null>((resolve, reject) => {
      const tx = db.transaction(STORE_WORLDS, 'readonly');
      const req = tx.objectStore(STORE_WORLDS).get(worldId);
      req.onsuccess = () => resolve((req.result as WorldSavePayload) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (res) return res;
  } catch {
    // fallback below
  }
  try {
    const raw = localStorage.getItem(`nexora_world_${worldId}`);
    return raw ? (JSON.parse(raw) as WorldSavePayload) : null;
  } catch {
    return null;
  }
}

export async function listWorldMetasFromDB(): Promise<WorldSaveMeta[]> {
  try {
    const db = await openDB();
    const list = await new Promise<WorldSaveMeta[]>((resolve, reject) => {
      const tx = db.transaction(STORE_WORLDS, 'readonly');
      const req = tx.objectStore(STORE_WORLDS).getAll();
      req.onsuccess = () => {
        const items = (req.result as WorldSavePayload[]) || [];
        resolve(
          items
            .map((w) => w.meta)
            .sort((a, b) => b.updatedAt - a.updatedAt),
        );
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return list;
  } catch {
    return [];
  }
}

export async function deleteWorldFromDB(worldId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_WORLDS, 'readwrite');
      tx.objectStore(STORE_WORLDS).delete(worldId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(`nexora_world_${worldId}`);
  } catch {
    // ignore
  }
}

export function createWorldId(): string {
  return `world_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function formatModeLabel(mode: GameMode): string {
  switch (mode) {
    case 'survival':
      return 'Überleben';
    case 'creative':
      return 'Kreativ';
    case 'adventure':
      return 'Abenteuer';
    case 'spectator':
      return 'Zuschauer';
  }
}
