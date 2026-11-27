import { ContentItem, ContentType, SiteBranding, ZoneType, normalizeCreditCost } from '../types';
import defaultItemsRaw from '../data/defaultItems.json';
import {
  auth,
  db,
  OperationType,
  handleFirestoreError,
} from '../firebase';
import { authService } from './auth';
import {
  INLINE_EMBED_MAX_UTF8_BYTES,
  CHUNK_EMBED_MAX_UTF8_BYTES,
  MAX_TOTAL_EMBED_UTF8_BYTES,
  getUtf8ByteLength,
  splitStringByUtf8Bytes,
} from '../utils/embed';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  DocumentReference,
  Query,
} from 'firebase/firestore';

const DB_NAME = 'HocLieuSo_DB';
const DB_VERSION = 1;
const STORE_NAME = 'content_items';
const SETTINGS_STORE = 'app_settings';
const ADMIN_EMAIL = 'vanloiphuhiep.09@gmail.com';
const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const REMOVED_ITEM_IDS = new Set([
  'item_1794753008608_keothanoi',
  'item_1794753233028_keocokienthuc',
  'item_1794754246083_lophocao3d',
  'item_1794754457668_lophocao3d_vr',
  'item_1794752725157_ai3dexhibition',
  'item_keotha_446b9a24',
  'item_lophocao3d_vercel',
  'item_tungubietbay_vercel',
  'item_keoco_kienthuc_restored',
  'item_lophocao3d_v2_gvsangtao',
]);

const BUNDLED_ADDON_IDS = new Set<string>([
  'item_phong_trung_bay_3d_ai_beb7b05a',
  'item_keotha_noiy_restored',
  'item_lophocao3d_restored',
  'item_tungubietbay_restored',
  'item_lophocaophienban2_3d',
  'item_lichsu_dialy4_bai10_bacbo_t1',
  'item_lichsu_dialy4_bai10_bacbo_t2',
  'item_lichsu_dialy4_bai10_quengoai_t1',
  'item_lichsu_dialy4_bai10_duxuan_t2',
  'item_khoahoc4_bai1_tinhchatnuoc',
  'item_ngontay_vercel',
  'item_nghiengdau_vercel',
  'item_huongdan_giongontay_yt',
  'item_vongquaygoiten_vercel',
  'item_trochoilatmanhghep_vercel',
  'item_vonghoakienthuc_vercel',
]);
const ALL_ZONES: ZoneType[] = [
  'virtual_spaces',
  'apps',
  'games',
  'simulations',
  'management',
  'guides',
];
const DELETED_ADDON_STORAGE_KEY = 'hoclieuso_deleted_addon_ids_v1';
const SEEN_FS_ADDON_STORAGE_KEY = 'hoclieuso_seen_fs_addon_ids_v1';
const PENDING_UPSERTS_STORAGE_KEY = 'hoclieuso_pending_fs_upserts_v1';
const PENDING_DELETES_STORAGE_KEY = 'hoclieuso_pending_fs_deletes_v1';
const PENDING_BRANDING_STORAGE_KEY = 'hoclieuso_pending_fs_branding_v1';
const BRANDING_LOCAL_STORAGE_KEY = 'hoclieuso_branding_v1';

export interface CloudSaveResult {
  cloudSynced: boolean;
  firestoreSynced: boolean;
  serverSynced: boolean;
  pendingCloudSync: boolean;
  needsGoogleCloudAuth: boolean;
  errorMessage?: string;
}

export interface PendingSyncFlushResult {
  syncedUpserts: number;
  syncedDeletes: number;
  syncedBranding: boolean;
  failedCount: number;
}

function readIdSetFromLocalStorage(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function writeIdSetToLocalStorage(key: string, set: Set<string>): void {
  try {
    if (set.size === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(Array.from(set)));
    }
  } catch {}
}

function addIdToLocalStorageSet(key: string, id: string): void {
  try {
    const set = readIdSetFromLocalStorage(key);
    set.add(id);
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {}
}

function removeIdFromLocalStorageSet(key: string, id: string): void {
  try {
    const set = readIdSetFromLocalStorage(key);
    if (set.delete(id)) {
      writeIdSetToLocalStorage(key, set);
    }
  } catch {}
}

function readPendingUpsertsMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PENDING_UPSERTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
    return {};
  } catch {
    return {};
  }
}

function writePendingUpsertsMap(map: Record<string, number>): void {
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(PENDING_UPSERTS_STORAGE_KEY);
    } else {
      localStorage.setItem(PENDING_UPSERTS_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {}
}

const RESTORE_WHEEL_PUZZLE_MARKER = 'hoclieuso_restore_wheel_puzzle_v2';
try {
  if (typeof localStorage !== 'undefined' && !localStorage.getItem(RESTORE_WHEEL_PUZZLE_MARKER)) {
    const restoredIds = [
      'item_vongquaygoiten_vercel',
      'item_trochoilatmanhghep_vercel',
      'item_vonghoakienthuc_vercel',
    ];
    for (const rId of restoredIds) {
      removeIdFromLocalStorageSet(DELETED_ADDON_STORAGE_KEY, rId);
      removeIdFromLocalStorageSet(SEEN_FS_ADDON_STORAGE_KEY, rId);
      removeIdFromLocalStorageSet(PENDING_DELETES_STORAGE_KEY, rId);
    }
    localStorage.setItem(RESTORE_WHEEL_PUZZLE_MARKER, '1');
  }
} catch {}

function isRemovedCatalogEntry(id: string, title?: string): boolean {
  if (REMOVED_ITEM_IDS.has(id)) return true;
  const lowerTitle = String(title || '').trim().toLowerCase();
  if (
    lowerTitle.includes('kéo co kiến thức') ||
    lowerTitle.includes('kéo co - chinh phục') ||
    lowerTitle.includes('chinh phục tri thức')
  ) {
    return true;
  }
  if (BUNDLED_ADDON_IDS.has(id)) return false;
  return false;
}

function shouldUpgradeBundledAddon(existing: ContentItem, candidate: ContentItem): boolean {
  if (existing.zone !== candidate.zone || existing.type !== candidate.type) {
    return true;
  }
  const exEmbed = existing.embedCode || '';
  if (
    candidate.id === 'item_phong_trung_bay_3d_ai_beb7b05a' &&
    !exEmbed.includes('data-exhibition-rev="v3-captions-rooms-protected"')
  ) {
    return true;
  }
  if (
    candidate.id === 'item_lophocao3d_restored' &&
    !exEmbed.includes('data-lophocao3d-rev="v2-protected-sync"')
  ) {
    return true;
  }
  if (
    candidate.id === 'item_keotha_noiy_restored' &&
    !exEmbed.includes('data-keotha-rev="v3-vercel-tts-fix"')
  ) {
    return true;
  }
  if (
    candidate.id === 'item_tungubietbay_restored' &&
    !exEmbed.includes('data-tungu-rev="v3-per-teacher-cloud-sync"')
  ) {
    return true;
  }
  if (
    candidate.id === 'item_lophocaophienban2_3d' &&
    !exEmbed.includes('data-lophocao3dv2-rev="v3-no-newtab-cloud-sync"')
  ) {
    return true;
  }
  if (
    (candidate.id === 'item_lichsu_dialy4_bai10_bacbo_t1' ||
      candidate.id === 'item_lichsu_dialy4_bai10_bacbo_t2') &&
    !exEmbed.includes('data-game-rev="v2-mon-lichsu-lop4"')
  ) {
    return true;
  }
  if (
    candidate.id === 'item_khoahoc4_bai1_tinhchatnuoc' &&
    !exEmbed.includes('th_nghi_m_m_ph_ng_khoa_h_c_4_n_c_v_cu_c_s_ng_7ea930fb.html')
  ) {
    return true;
  }
  if (
    candidate.id === 'item_vongquaygoiten_vercel' &&
    !exEmbed.includes('data-vongquaygoiten-rev="v2-vercel-cross-device-tts"')
  ) {
    return true;
  }
  if (
    candidate.id === 'item_trochoilatmanhghep_vercel' &&
    !exEmbed.includes('data-latmanhghep-rev="v2-vercel-cross-device-tts"')
  ) {
    return true;
  }
  if (
    candidate.id === 'item_vonghoakienthuc_vercel' &&
    !exEmbed.includes('data-vonghoakienthuc-rev="v2-vercel-cross-device-tts"')
  ) {
    return true;
  }
  return false;
}

function toMillis(val: any, fallback = Date.now()): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof val.toMillis === 'function') return val.toMillis();
  return fallback;
}

async function parseJsonSafe(res: Response): Promise<any | null> {
  const ct = res.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) {
    return null;
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function isFirebaseAdminSignedIn(): boolean {
  const user = auth.currentUser;
  return Boolean(
    user &&
      user.emailVerified &&
      user.email &&
      user.email.trim().toLowerCase() === ADMIN_EMAIL
  );
}

async function getDocPreferServer(ref: DocumentReference<any>) {
  try {
    return await getDocFromServer(ref);
  } catch {
    return await getDoc(ref);
  }
}

async function getDocsPreferServer(q: Query<any>) {
  try {
    return await getDocsFromServer(q);
  } catch {
    return await getDocs(q);
  }
}

function normalizeZone(rawZone: any): ZoneType | null {
  if (rawZone === 'documents') return 'simulations';
  if (rawZone === 'images') return 'apps';
  if (
    rawZone === 'virtual_spaces' ||
    rawZone === 'apps' ||
    rawZone === 'games' ||
    rawZone === 'simulations' ||
    rawZone === 'management' ||
    rawZone === 'guides'
  ) {
    return rawZone;
  }
  return null;
}

function normalizeType(rawType: any, zone: ZoneType): ContentType {
  if (
    rawType === 'virtual_space' ||
    rawType === 'app' ||
    rawType === 'game' ||
    rawType === 'simulation' ||
    rawType === 'management' ||
    rawType === 'guide'
  ) {
    return rawType;
  }
  if (zone === 'virtual_spaces') return 'virtual_space';
  if (zone === 'games') return 'game';
  if (zone === 'simulations') return 'simulation';
  if (zone === 'management') return 'management';
  if (zone === 'guides') return 'guide';
  return 'app';
}

function normalizeItem(raw: any, fallbackOrder = 0): ContentItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id || id.length > 128 || !VALID_ID_REGEX.test(id)) return null;

  const zone = normalizeZone(raw.zone);
  if (!zone) return null;

  const title = String(raw.title || '').trim().slice(0, 300);
  if (!title || isRemovedCatalogEntry(id, title)) return null;

  const type = normalizeType(raw.type, zone);
  const now = Date.now();
  const order =
    typeof raw.order === 'number' && Number.isFinite(raw.order)
      ? Math.max(0, Math.min(100000, Math.floor(raw.order)))
      : fallbackOrder;

  const item: ContentItem = {
    id,
    zone,
    title,
    type,
    order,
    createdAt: toMillis(raw.createdAt, now),
    updatedAt: toMillis(raw.updatedAt, now),
  };

  if (typeof raw.description === 'string' && raw.description.length > 0) {
    item.description = raw.description.slice(0, 5000);
  }
  if (typeof raw.embedCode === 'string' && raw.embedCode.length > 0) {
    if (getUtf8ByteLength(raw.embedCode) <= MAX_TOTAL_EMBED_UTF8_BYTES) {
      item.embedCode = raw.embedCode;
    } else {
      item.embedCode = raw.embedCode.slice(0, MAX_TOTAL_EMBED_UTF8_BYTES);
    }
  }
  if (typeof raw.instructions === 'string' && raw.instructions.length > 0) {
    item.instructions = raw.instructions.slice(0, 5000);
  }
  if (zone !== 'games' && zone !== 'simulations') {
    if (typeof raw.grade === 'string' && raw.grade.length > 0) {
      item.grade = raw.grade.slice(0, 40);
    }
    if (typeof raw.subject === 'string' && raw.subject.length > 0) {
      item.subject = raw.subject.slice(0, 60);
    }
  }
  const normalizedCost = normalizeCreditCost(raw.creditCost);
  if (normalizedCost !== undefined) {
    item.creditCost = normalizedCost;
  }

  return item;
}

function normalizeItemsArray(rawList: any): ContentItem[] {
  if (!Array.isArray(rawList)) return [];
  const list: ContentItem[] = [];
  rawList.forEach((raw, idx) => {
    const item = normalizeItem(raw, idx + 1);
    if (item) list.push(item);
  });
  list.sort((a, b) => (a.order || 0) - (b.order || 0));
  return list;
}

function prepareEmbedForFirestore(embedCode?: string): {
  inlineEmbed: string;
  chunks: string[];
} {
  const raw = typeof embedCode === 'string' ? embedCode : '';
  if (!raw) {
    return { inlineEmbed: '', chunks: [] };
  }
  if (getUtf8ByteLength(raw) <= INLINE_EMBED_MAX_UTF8_BYTES) {
    return { inlineEmbed: raw, chunks: [] };
  }
  const chunks = splitStringByUtf8Bytes(raw, CHUNK_EMBED_MAX_UTF8_BYTES).slice(0, 30);
  return { inlineEmbed: '', chunks };
}

function buildFirestoreCreatePayload(
  item: ContentItem,
  inlineEmbed: string,
  embedChunkCount: number
): Record<string, any> {
  const payload: Record<string, any> = {
    id: item.id,
    zone: item.zone,
    title: item.title.trim().slice(0, 300),
    type: item.type,
    order: Math.max(0, Math.min(100000, Math.floor(item.order || 0))),
    embedChunkCount,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (item.description) payload.description = item.description.slice(0, 5000);
  if (inlineEmbed) payload.embedCode = inlineEmbed;
  if (item.instructions) payload.instructions = item.instructions.slice(0, 5000);
  if (item.grade) payload.grade = item.grade.slice(0, 40);
  if (item.subject) payload.subject = item.subject.slice(0, 60);
  const createCost = normalizeCreditCost(item.creditCost);
  if (createCost !== undefined) payload.creditCost = createCost;
  return payload;
}

function buildFirestoreUpdatePayload(
  item: ContentItem,
  inlineEmbed: string,
  embedChunkCount: number
): Record<string, any> {
  const payload: Record<string, any> = {
    zone: item.zone,
    title: item.title.trim().slice(0, 300),
    type: item.type,
    order: Math.max(0, Math.min(100000, Math.floor(item.order || 0))),
    embedChunkCount,
    embedCode: inlineEmbed,
    updatedAt: serverTimestamp(),
  };
  if (item.description !== undefined) {
    payload.description = item.description.slice(0, 5000);
  }
  if (item.instructions !== undefined) {
    payload.instructions = item.instructions.slice(0, 5000);
  }
  if (item.grade !== undefined) {
    payload.grade = item.grade.slice(0, 40);
  }
  if (item.subject !== undefined) {
    payload.subject = item.subject.slice(0, 60);
  }
  const updateCost = normalizeCreditCost(item.creditCost);
  if (updateCost !== undefined) {
    payload.creditCost = updateCost;
  }
  return payload;
}

class StorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private seedingPromise: Promise<void> | null = null;
  private flushPromise: Promise<PendingSyncFlushResult> | null = null;
  private pendingAppWrites = new Map<string, Promise<void>>();
  private appDataSnapshots = new Map<string, Record<string, string>>();
  private pendingAddonItems = new Map<string, ContentItem>();
  private pendingUpsertItemsMap = new Map<string, ContentItem>();
  private chunkReadCache = new Map<string, string>();
  private syncStatusListeners = new Set<() => void>();

  private notifySyncStatus(): void {
    for (const cb of this.syncStatusListeners) {
      try {
        cb();
      } catch {}
    }
  }

  subscribeSyncStatus(cb: () => void): () => void {
    this.syncStatusListeners.add(cb);
    return () => {
      this.syncStatusListeners.delete(cb);
    };
  }

  isCloudAdminConnected(): boolean {
    return isFirebaseAdminSignedIn();
  }

  getPendingCloudSyncCount(): number {
    const upserts = Object.keys(readPendingUpsertsMap()).length;
    const deletes = readIdSetFromLocalStorage(PENDING_DELETES_STORAGE_KEY).size;
    const branding = this.hasPendingBrandingSync() ? 1 : 0;
    return upserts + deletes + branding;
  }

  private hasPendingBrandingSync(): boolean {
    try {
      return localStorage.getItem(PENDING_BRANDING_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private setPendingBrandingSync(pending: boolean): void {
    try {
      if (pending) {
        localStorage.setItem(PENDING_BRANDING_STORAGE_KEY, '1');
      } else {
        localStorage.removeItem(PENDING_BRANDING_STORAGE_KEY);
      }
    } catch {}
    this.notifySyncStatus();
  }

  private markItemPendingUpsert(item: ContentItem): void {
    this.pendingUpsertItemsMap.set(item.id, item);
    const map = readPendingUpsertsMap();
    map[item.id] = item.updatedAt || Date.now();
    writePendingUpsertsMap(map);
    removeIdFromLocalStorageSet(PENDING_DELETES_STORAGE_KEY, item.id);
    this.notifySyncStatus();
  }

  private clearItemPendingUpsert(id: string): void {
    this.pendingUpsertItemsMap.delete(id);
    const map = readPendingUpsertsMap();
    if (Object.prototype.hasOwnProperty.call(map, id)) {
      delete map[id];
      writePendingUpsertsMap(map);
      this.notifySyncStatus();
    }
  }

  private markItemPendingDelete(id: string): void {
    this.pendingUpsertItemsMap.delete(id);
    const map = readPendingUpsertsMap();
    if (Object.prototype.hasOwnProperty.call(map, id)) {
      delete map[id];
      writePendingUpsertsMap(map);
    }
    addIdToLocalStorageSet(PENDING_DELETES_STORAGE_KEY, id);
    this.notifySyncStatus();
  }

  private clearItemPendingDelete(id: string): void {
    removeIdFromLocalStorageSet(PENDING_DELETES_STORAGE_KEY, id);
    this.notifySyncStatus();
  }

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const idb = (event.target as IDBOpenDBRequest).result;
        if (!idb.objectStoreNames.contains(STORE_NAME)) {
          const store = idb.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('zone', 'zone', { unique: false });
          store.createIndex('order', 'order', { unique: false });
        }
        if (!idb.objectStoreNames.contains(SETTINGS_STORE)) {
          idb.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  private async putLocalItem(item: ContentItem): Promise<void> {
    try {
      const idb = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = idb.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(item);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (err) {
      console.warn('Fallback save to IndexedDB failed:', err);
      try {
        const existing = await this.getLocalItems();
        const filtered = existing.filter((i) => i.id !== item.id);
        filtered.push(item);
        localStorage.setItem('hoclieuso_items', JSON.stringify(filtered));
      } catch {}
    }
  }

  private async deleteLocalItem(id: string): Promise<void> {
    try {
      const idb = await this.getDB();
      await new Promise<void>((resolve) => {
        const transaction = idb.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      });
    } catch {}
  }

  private async syncLocalCache(items: ContentItem[]): Promise<void> {
    try {
      const idb = await this.getDB();
      await new Promise<void>((resolve) => {
        const transaction = idb.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
        for (const item of items) {
          store.put(item);
        }
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      });
    } catch {
      try {
        localStorage.setItem('hoclieuso_items', JSON.stringify(items));
      } catch {}
    }
  }

  private async getLocalItems(): Promise<ContentItem[]> {
    try {
      const idb = await this.getDB();
      return new Promise((resolve) => {
        const transaction = idb.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
          const items = normalizeItemsArray(request.result || []);
          resolve(items);
        };
        request.onerror = () => resolve([]);
      });
    } catch {
      try {
        const raw = localStorage.getItem('hoclieuso_items');
        return raw ? normalizeItemsArray(JSON.parse(raw)) : [];
      } catch {
        return [];
      }
    }
  }

  private getBundledDefaultItems(): ContentItem[] {
    return normalizeItemsArray(defaultItemsRaw);
  }

  private async fetchServerItems(): Promise<ContentItem[] | null> {
    try {
      const res = await fetch('/api/items', { cache: 'no-store' });
      const data = await parseJsonSafe(res);
      if (res.ok && data?.success && Array.isArray(data.items)) {
        return normalizeItemsArray(data.items);
      }
    } catch {}
    return null;
  }

  private async fetchPublicSeedItems(): Promise<ContentItem[] | null> {
    try {
      const res = await fetch('/seed-items.json', { cache: 'no-store' });
      const data = await parseJsonSafe(res);
      if (res.ok && Array.isArray(data)) {
        return normalizeItemsArray(data);
      }
    } catch {}
    return null;
  }

  private async hydrateFirestoreDocs(
    docs: Array<{ id: string; data: () => any }>
  ): Promise<ContentItem[]> {
    const items: ContentItem[] = [];
    for (const docSnap of docs) {
      const rawData = docSnap.data();
      const normalized = normalizeItem({ id: docSnap.id, ...rawData });
      if (!normalized) continue;

      const chunkCount =
        typeof rawData?.embedChunkCount === 'number' ? rawData.embedChunkCount : 0;

      if (chunkCount > 0 && !normalized.embedCode) {
        const cacheKey = `${docSnap.id}:${normalized.updatedAt}:${chunkCount}`;
        const cached = this.chunkReadCache.get(cacheKey);
        if (cached !== undefined) {
          normalized.embedCode = cached;
        } else {
          try {
            const chunksSnap = await getDocsPreferServer(
              collection(db, 'content_items', docSnap.id, 'embed_chunks')
            );
            const sortedChunks = chunksSnap.docs
              .map((c) => {
                const cd = c.data();
                return {
                  index: typeof cd?.index === 'number' ? cd.index : 0,
                  data: typeof cd?.data === 'string' ? cd.data : '',
                };
              })
              .sort((a, b) => a.index - b.index);
            const assembled = sortedChunks.map((c) => c.data).join('');
            if (assembled) {
              normalized.embedCode = assembled;
              this.chunkReadCache.set(cacheKey, assembled);
            }
          } catch (chunkErr) {
            console.warn(`Could not hydrate embed_chunks for ${docSnap.id}:`, chunkErr);
          }
        }
      }

      items.push(normalized);
    }

    items.sort((a, b) => (a.order || 0) - (b.order || 0));
    return items;
  }

  private async fetchFirestoreItemsState(): Promise<{
    items: ContentItem[];
    initialized: boolean;
    reachable: boolean;
  }> {
    try {
      const catalogRef = doc(db, 'site_settings', 'catalog');
      const itemsQuery = query(
        collection(db, 'content_items'),
        where('zone', 'in', ALL_ZONES)
      );
      const [catalogSnap, itemsSnap] = await Promise.all([
        getDocPreferServer(catalogRef).catch(() => null),
        getDocsPreferServer(itemsQuery),
      ]);

      const items = await this.hydrateFirestoreDocs(itemsSnap.docs);
      const initialized = Boolean(
        catalogSnap?.exists() && catalogSnap.data()?.initialized === true
      );
      return { items, initialized, reachable: true };
    } catch (err) {
      console.warn('Firestore content_items read fallback:', err);
      return { items: [], initialized: false, reachable: false };
    }
  }

  private async writeItemToFirestore(item: ContentItem): Promise<void> {
    const path = `content_items/${item.id}`;
    const ref = doc(db, 'content_items', item.id);
    const { inlineEmbed, chunks } = prepareEmbedForFirestore(item.embedCode);
    const chunkCount = chunks.length;

    const snap = await getDocPreferServer(ref);
    if (snap.exists()) {
      await updateDoc(ref, buildFirestoreUpdatePayload(item, inlineEmbed, chunkCount));
    } else {
      await setDoc(ref, buildFirestoreCreatePayload(item, inlineEmbed, chunkCount));
    }

    // Write chunk documents when embed exceeds inline limit (batch up to 4 per commit)
    const chunksCol = collection(db, 'content_items', item.id, 'embed_chunks');
    const BATCH_LIMIT = 4;
    for (let i = 0; i < chunks.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      const slice = chunks.slice(i, i + BATCH_LIMIT);
      slice.forEach((chunkStr, offset) => {
        const idx = i + offset;
        const chunkRef = doc(chunksCol, `chunk_${idx}`);
        batch.set(chunkRef, {
          index: idx,
          data: chunkStr,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }

    // Remove stale chunks if the embed got smaller or switched to inline/URL
    try {
      const existingChunksSnap = await getDocsPreferServer(chunksCol);
      const validIds = new Set(chunks.map((_, idx) => `chunk_${idx}`));
      for (const oldChunk of existingChunksSnap.docs) {
        if (!validIds.has(oldChunk.id)) {
          await deleteDoc(oldChunk.ref).catch(() => {});
        }
      }
    } catch {}

    // Bust stale chunk cache for this item
    for (const key of Array.from(this.chunkReadCache.keys())) {
      if (key.startsWith(`${item.id}:`)) {
        this.chunkReadCache.delete(key);
      }
    }
    if (chunkCount > 0 && item.embedCode) {
      this.chunkReadCache.set(`${item.id}:${item.updatedAt}:${chunkCount}`, item.embedCode);
    }

    if (!path) return;
  }

  private async deleteItemFromFirestore(id: string): Promise<void> {
    try {
      const chunksCol = collection(db, 'content_items', id, 'embed_chunks');
      const existingChunksSnap = await getDocsPreferServer(chunksCol);
      for (const chunkDoc of existingChunksSnap.docs) {
        await deleteDoc(chunkDoc.ref).catch(() => {});
      }
    } catch {}

    await deleteDoc(doc(db, 'content_items', id));

    for (const key of Array.from(this.chunkReadCache.keys())) {
      if (key.startsWith(`${id}:`)) {
        this.chunkReadCache.delete(key);
      }
    }
  }

  private async getPendingUpsertItems(): Promise<ContentItem[]> {
    const pendingMap = readPendingUpsertsMap();
    const pendingIds = Object.keys(pendingMap);
    if (pendingIds.length === 0) return [];

    const [localItems, serverItems] = await Promise.all([
      this.getLocalItems(),
      this.fetchServerItems(),
    ]);

    const localById = new Map(localItems.map((i) => [i.id, i]));
    const serverById = new Map((serverItems || []).map((i) => [i.id, i]));

    const result: ContentItem[] = [];
    for (const id of pendingIds) {
      const candidate =
        this.pendingUpsertItemsMap.get(id) || localById.get(id) || serverById.get(id);
      if (candidate && !isRemovedCatalogEntry(candidate.id, candidate.title)) {
        result.push(candidate);
      }
    }
    return result;
  }

  private async applyPendingMutations(baseItems: ContentItem[]): Promise<ContentItem[]> {
    const pendingDeletes = readIdSetFromLocalStorage(PENDING_DELETES_STORAGE_KEY);
    const pendingUpserts = await this.getPendingUpsertItems();

    if (pendingDeletes.size === 0 && pendingUpserts.length === 0) {
      return baseItems;
    }

    const byId = new Map<string, ContentItem>();
    for (const item of baseItems) {
      if (!pendingDeletes.has(item.id)) {
        byId.set(item.id, item);
      }
    }

    for (const pendingItem of pendingUpserts) {
      if (pendingDeletes.has(pendingItem.id)) continue;
      const existing = byId.get(pendingItem.id);
      if (!existing || (pendingItem.updatedAt || 0) >= (existing.updatedAt || 0)) {
        byId.set(pendingItem.id, pendingItem);
      }
    }

    return Array.from(byId.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  // Flushes any locally-queued upserts, deletes, or branding updates up to Cloud Firestore
  async syncPendingToFirestore(): Promise<PendingSyncFlushResult> {
    if (!isFirebaseAdminSignedIn()) {
      return {
        syncedUpserts: 0,
        syncedDeletes: 0,
        syncedBranding: false,
        failedCount: this.getPendingCloudSyncCount(),
      };
    }

    if (this.flushPromise) {
      return this.flushPromise;
    }

    this.flushPromise = (async () => {
      let syncedUpserts = 0;
      let syncedDeletes = 0;
      let syncedBranding = false;
      let failedCount = 0;

      try {
        const pendingDeletes = readIdSetFromLocalStorage(PENDING_DELETES_STORAGE_KEY);
        for (const deleteId of pendingDeletes) {
          try {
            await this.deleteItemFromFirestore(deleteId);
            this.clearItemPendingDelete(deleteId);
            syncedDeletes += 1;
          } catch (err) {
            failedCount += 1;
            console.warn(`Pending delete sync failed for ${deleteId}:`, err);
          }
        }

        const pendingUpserts = await this.getPendingUpsertItems();
        for (const item of pendingUpserts) {
          try {
            await this.writeItemToFirestore(item);
            this.clearItemPendingUpsert(item.id);
            syncedUpserts += 1;
          } catch (err) {
            failedCount += 1;
            console.warn(`Pending item sync failed for ${item.id}:`, err);
          }
        }

        // Mark catalog initialized if we synced at least one item
        if (syncedUpserts > 0 || syncedDeletes > 0) {
          await setDoc(doc(db, 'site_settings', 'catalog'), {
            initialized: true,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }

        if (this.hasPendingBrandingSync()) {
          const localBranding = this.getBranding();
          try {
            await this.writeBrandingDocToFirestore(localBranding);
            this.setPendingBrandingSync(false);
            syncedBranding = true;
          } catch (err) {
            failedCount += 1;
            console.warn('Pending branding sync failed:', err);
          }
        }
      } finally {
        this.flushPromise = null;
        this.notifySyncStatus();
      }

      return { syncedUpserts, syncedDeletes, syncedBranding, failedCount };
    })();

    return this.flushPromise;
  }

  // Ensures existing bundled/server items + pending changes are persisted into Firestore once Google Admin signs in
  async ensureCatalogSeededToFirestore(overrideSeed?: ContentItem[]): Promise<void> {
    if (!isFirebaseAdminSignedIn()) return;
    if (this.seedingPromise) return this.seedingPromise;

    this.seedingPromise = (async () => {
      try {
        // First flush any pending local mutations created while signed in locally
        await this.syncPendingToFirestore();

        for (const removedId of REMOVED_ITEM_IDS) {
          await this.deleteItemFromFirestore(removedId).catch(() => {});
        }
        const allSnap = await getDocsPreferServer(
          query(
            collection(db, 'content_items'),
            where('zone', 'in', ALL_ZONES)
          )
        );
        for (const d of allSnap.docs) {
          if (isRemovedCatalogEntry(d.id, String(d.data()?.title || ''))) {
            await this.deleteItemFromFirestore(d.id).catch(() => {});
          }
        }

        const catalogRef = doc(db, 'site_settings', 'catalog');
        const catalogSnap = await getDocPreferServer(catalogRef);
        const alreadyInitialized = Boolean(
          catalogSnap.exists() && catalogSnap.data()?.initialized === true
        );

        const existingSnap = await getDocsPreferServer(
          query(
            collection(db, 'content_items'),
            where('zone', 'in', ALL_ZONES)
          )
        );
        const existingById = new Map<string, ContentItem>();
        existingSnap.docs.forEach((d) => {
          const normalized = normalizeItem({ id: d.id, ...d.data() });
          if (normalized) existingById.set(d.id, normalized);
        });
        const existingIds = new Set(existingSnap.docs.map((d) => d.id));
        const deletedAddons = readIdSetFromLocalStorage(DELETED_ADDON_STORAGE_KEY);
        const seenFsAddons = readIdSetFromLocalStorage(SEEN_FS_ADDON_STORAGE_KEY);
        for (const id of existingIds) {
          if (BUNDLED_ADDON_IDS.has(id)) {
            addIdToLocalStorageSet(SEEN_FS_ADDON_STORAGE_KEY, id);
            seenFsAddons.add(id);
          }
        }

        const [serverItems, publicSeed, localItems] = await Promise.all([
          this.fetchServerItems(),
          this.fetchPublicSeedItems(),
          this.getLocalItems(),
        ]);

        const bundledItems = this.getBundledDefaultItems();
        let candidates = overrideSeed;
        if (!candidates || candidates.length === 0) {
          const base =
            (bundledItems.length > 0 && bundledItems) ||
            (serverItems && serverItems.length > 0 && serverItems) ||
            (publicSeed && publicSeed.length > 0 && publicSeed) ||
            [];
          const byId = new Map<string, ContentItem>();
          for (const it of base) byId.set(it.id, it);
          for (const it of localItems) {
            if (!byId.has(it.id)) byId.set(it.id, it);
          }
          candidates = Array.from(byId.values());
        }

        if (alreadyInitialized) {
          for (const item of candidates) {
            if (
              BUNDLED_ADDON_IDS.has(item.id) &&
              !existingIds.has(item.id) &&
              !deletedAddons.has(item.id) &&
              !seenFsAddons.has(item.id)
            ) {
              await this.writeItemToFirestore(item);
              addIdToLocalStorageSet(SEEN_FS_ADDON_STORAGE_KEY, item.id);
              this.pendingAddonItems.delete(item.id);
            } else if (
              BUNDLED_ADDON_IDS.has(item.id) &&
              existingIds.has(item.id) &&
              !deletedAddons.has(item.id)
            ) {
              const existingFsItem = existingById.get(item.id);
              if (existingFsItem && shouldUpgradeBundledAddon(existingFsItem, item)) {
                await this.writeItemToFirestore(item);
              }
            }
          }
          return;
        }

        const pendingDeletes = readIdSetFromLocalStorage(PENDING_DELETES_STORAGE_KEY);
        for (const item of candidates) {
          if (
            !existingIds.has(item.id) &&
            !deletedAddons.has(item.id) &&
            !pendingDeletes.has(item.id)
          ) {
            await this.writeItemToFirestore(item);
            if (BUNDLED_ADDON_IDS.has(item.id)) {
              addIdToLocalStorageSet(SEEN_FS_ADDON_STORAGE_KEY, item.id);
              this.pendingAddonItems.delete(item.id);
            }
          }
        }

        await setDoc(catalogRef, {
          initialized: true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Auto-seed content_items to Firestore warning:', err);
      } finally {
        this.seedingPromise = null;
      }
    })();

    return this.seedingPromise;
  }

  // Loads from shared Cloud Firestore first (works across every computer & browser), falling back to Express API / bundled seed
  async getAllItems(): Promise<ContentItem[]> {
    const [fsState, serverItems] = await Promise.all([
      this.fetchFirestoreItemsState(),
      this.fetchServerItems(),
    ]);

    // Case 1: Firestore has items or catalog has been officially initialized
    if (fsState.reachable && (fsState.items.length > 0 || fsState.initialized)) {
      const merged = [...fsState.items];
      const existingIds = new Set(merged.map((i) => i.id));
      for (const item of merged) {
        if (BUNDLED_ADDON_IDS.has(item.id)) {
          addIdToLocalStorageSet(SEEN_FS_ADDON_STORAGE_KEY, item.id);
          this.pendingAddonItems.delete(item.id);
        }
      }

      const deletedAddons = readIdSetFromLocalStorage(DELETED_ADDON_STORAGE_KEY);
      const seenFsAddons = readIdSetFromLocalStorage(SEEN_FS_ADDON_STORAGE_KEY);
      const addonSource =
        serverItems !== null ? serverItems : this.getBundledDefaultItems();
      let hasNewPendingAddon = false;

      for (const candidate of addonSource) {
        if (!BUNDLED_ADDON_IDS.has(candidate.id)) continue;
        const existingIdx = merged.findIndex((m) => m.id === candidate.id);
        if (existingIdx >= 0) {
          if (shouldUpgradeBundledAddon(merged[existingIdx], candidate)) {
            merged[existingIdx] = candidate;
            hasNewPendingAddon = true;
          }
        } else if (
          !deletedAddons.has(candidate.id) &&
          !seenFsAddons.has(candidate.id)
        ) {
          merged.push(candidate);
          existingIds.add(candidate.id);
          this.pendingAddonItems.set(candidate.id, candidate);
          hasNewPendingAddon = true;
        }
      }

      if (hasNewPendingAddon) {
        merged.sort((a, b) => (a.order || 0) - (b.order || 0));
        if (isFirebaseAdminSignedIn()) {
          this.ensureCatalogSeededToFirestore().catch(() => {});
        }
      }

      const withPending = await this.applyPendingMutations(merged);
      this.syncLocalCache(withPending).catch(() => {});
      return withPending;
    }

    // Case 2: Firestore is empty & not initialized yet -> use bundled defaultItems, Express items, or public seed
    const localItems = await this.getLocalItems();
    const bundledList = this.getBundledDefaultItems();
    let seedSource =
      serverItems && serverItems.length > 0
        ? serverItems
        : await this.fetchPublicSeedItems();

    if (!seedSource || seedSource.length === 0) {
      seedSource = bundledList;
    }

    const mergedMap = new Map<string, ContentItem>();
    for (const item of seedSource) {
      mergedMap.set(item.id, item);
    }
    for (const localItem of localItems) {
      const existing = mergedMap.get(localItem.id);
      if (!existing || (localItem.updatedAt || 0) > (existing.updatedAt || 0)) {
        mergedMap.set(localItem.id, localItem);
      }
    }
    const deletedAddons = readIdSetFromLocalStorage(DELETED_ADDON_STORAGE_KEY);
    for (const bundled of bundledList) {
      if (!BUNDLED_ADDON_IDS.has(bundled.id) || deletedAddons.has(bundled.id)) continue;
      const existing = mergedMap.get(bundled.id);
      if (!existing || shouldUpgradeBundledAddon(existing, bundled)) {
        mergedMap.set(bundled.id, bundled);
      }
    }

    const baseMerged = Array.from(mergedMap.values()).sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );
    const withPending = await this.applyPendingMutations(baseMerged);

    this.syncLocalCache(withPending).catch(() => {});
    if (isFirebaseAdminSignedIn() && fsState.reachable) {
      this.ensureCatalogSeededToFirestore(withPending).catch(() => {});
    }

    return withPending;
  }

  // Saves permanently to Cloud Firestore (cross-computer & cross-browser), Express server (if available), and local IndexedDB
  async saveItem(item: ContentItem): Promise<CloudSaveResult> {
    if (BUNDLED_ADDON_IDS.has(item.id)) {
      removeIdFromLocalStorageSet(DELETED_ADDON_STORAGE_KEY, item.id);
    }

    // Always persist locally & queue first so nothing is lost even if network fails
    this.markItemPendingUpsert(item);
    await this.putLocalItem(item);

    let firestoreSynced = false;
    let serverSynced = false;
    let needsGoogleCloudAuth = !isFirebaseAdminSignedIn();
    let firestoreErrorMessage: string | undefined;

    if (isFirebaseAdminSignedIn()) {
      const path = `content_items/${item.id}`;
      try {
        await this.ensureCatalogSeededToFirestore();
        await this.writeItemToFirestore(item);
        await setDoc(doc(db, 'site_settings', 'catalog'), {
          initialized: true,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        this.clearItemPendingUpsert(item.id);
        firestoreSynced = true;
      } catch (err: any) {
        firestoreErrorMessage =
          err instanceof Error ? err.message : 'Không thể đồng bộ lên Cloud Firestore.';
        try {
          handleFirestoreError(err, OperationType.WRITE, path);
        } catch (wrappedErr: any) {
          firestoreErrorMessage = wrappedErr?.message || firestoreErrorMessage;
        }
      }
    }

    try {
      const headers = await authService.getAdminRequestHeaders();
      const res = await fetch('/api/items', {
        method: 'POST',
        headers,
        body: JSON.stringify(item),
      });
      const json = await parseJsonSafe(res);
      if (res.ok && json?.success) {
        serverSynced = true;
      }
    } catch {}

    const cloudSynced = firestoreSynced;
    const pendingCloudSync = !firestoreSynced;

    if (isFirebaseAdminSignedIn() && !firestoreSynced) {
      throw new Error(
        firestoreErrorMessage ||
          'Lỗi khi lưu nội dung lên Cloud Firestore. Dữ liệu đã được giữ lại tạm trên máy để thử đồng bộ lại.'
      );
    }

    return {
      cloudSynced,
      firestoreSynced,
      serverSynced,
      pendingCloudSync,
      needsGoogleCloudAuth,
      errorMessage: firestoreErrorMessage,
    };
  }

  // Deletes permanently from Cloud Firestore, Express server, and local IndexedDB
  async deleteItem(id: string): Promise<CloudSaveResult> {
    if (BUNDLED_ADDON_IDS.has(id)) {
      addIdToLocalStorageSet(DELETED_ADDON_STORAGE_KEY, id);
      this.pendingAddonItems.delete(id);
    }

    this.markItemPendingDelete(id);
    await this.deleteLocalItem(id);

    let firestoreSynced = false;
    let serverSynced = false;
    const needsGoogleCloudAuth = !isFirebaseAdminSignedIn();
    let firestoreErrorMessage: string | undefined;

    if (isFirebaseAdminSignedIn()) {
      const path = `content_items/${id}`;
      try {
        await this.ensureCatalogSeededToFirestore();
        await this.deleteItemFromFirestore(id);
        this.clearItemPendingDelete(id);
        firestoreSynced = true;
      } catch (err: any) {
        firestoreErrorMessage =
          err instanceof Error ? err.message : 'Không thể xóa trên Cloud Firestore.';
        try {
          handleFirestoreError(err, OperationType.DELETE, path);
        } catch (wrappedErr: any) {
          firestoreErrorMessage = wrappedErr?.message || firestoreErrorMessage;
        }
      }
    }

    try {
      const headers = await authService.getAdminRequestHeaders();
      const res = await fetch(`/api/items/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      const json = await parseJsonSafe(res);
      if (res.ok && json?.success) {
        serverSynced = true;
      }
    } catch {}

    if (isFirebaseAdminSignedIn() && !firestoreSynced) {
      throw new Error(
        firestoreErrorMessage ||
          'Lỗi khi xóa nội dung trên Cloud Firestore. Thao tác xóa đang chờ đồng bộ lại.'
      );
    }

    return {
      cloudSynced: firestoreSynced,
      firestoreSynced,
      serverSynced,
      pendingCloudSync: !firestoreSynced,
      needsGoogleCloudAuth,
      errorMessage: firestoreErrorMessage,
    };
  }

  async clearAll(): Promise<void> {
    if (isFirebaseAdminSignedIn()) {
      try {
        const snap = await getDocsPreferServer(
          query(
            collection(db, 'content_items'),
            where('zone', 'in', ALL_ZONES)
          )
        );
        for (const docSnap of snap.docs) {
          await this.deleteItemFromFirestore(docSnap.id);
        }
        await setDoc(doc(db, 'site_settings', 'catalog'), {
          initialized: true,
          updatedAt: serverTimestamp(),
        });
        writePendingUpsertsMap({});
        writeIdSetToLocalStorage(PENDING_DELETES_STORAGE_KEY, new Set());
        this.pendingUpsertItemsMap.clear();
        this.notifySyncStatus();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'content_items');
      }
    }

    try {
      const headers = await authService.getAdminRequestHeaders();
      await fetch('/api/items/clear', { method: 'POST', headers });
    } catch {}

    try {
      const idb = await this.getDB();
      const transaction = idb.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
    } catch {
      localStorage.removeItem('hoclieuso_items');
    }
  }

  async exportData(): Promise<string> {
    const items = await this.getAllItems();
    const branding = await this.fetchBrandingFromServer();
    return JSON.stringify(
      {
        version: 1,
        appName: 'HocLieuSo_GiaoVienSangTao',
        exportedAt: new Date().toISOString(),
        items,
        branding,
      },
      null,
      2
    );
  }

  async importData(jsonString: string): Promise<{ items: ContentItem[]; branding?: SiteBranding }> {
    const parsed = JSON.parse(jsonString);
    if (!parsed || !Array.isArray(parsed.items)) {
      throw new Error('Định dạng tệp học liệu không hợp lệ');
    }

    const normalized = normalizeItemsArray(parsed.items);

    await this.syncLocalCache(normalized);
    writePendingUpsertsMap({});
    writeIdSetToLocalStorage(PENDING_DELETES_STORAGE_KEY, new Set());
    this.pendingUpsertItemsMap.clear();

    if (isFirebaseAdminSignedIn()) {
      try {
        const existingSnap = await getDocsPreferServer(
          query(
            collection(db, 'content_items'),
            where('zone', 'in', ALL_ZONES)
          )
        );
        const importedIds = new Set(normalized.map((i) => i.id));
        for (const d of existingSnap.docs) {
          if (!importedIds.has(d.id)) {
            await this.deleteItemFromFirestore(d.id);
          }
        }

        for (const item of normalized) {
          await this.writeItemToFirestore(item);
        }

        await setDoc(doc(db, 'site_settings', 'catalog'), {
          initialized: true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        for (const item of normalized) {
          this.markItemPendingUpsert(item);
        }
        handleFirestoreError(err, OperationType.WRITE, 'content_items');
      }
    } else {
      for (const item of normalized) {
        this.markItemPendingUpsert(item);
      }
    }

    try {
      const headers = await authService.getAdminRequestHeaders();
      await fetch('/api/items/batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ items: normalized }),
      });
    } catch {}

    if (parsed.branding) {
      await this.saveBranding(parsed.branding);
    }
    this.notifySyncStatus();
    return { items: normalized, branding: parsed.branding };
  }

  // Branding: syncs with Firestore /site_settings/branding + Express /api/branding + localStorage
  async fetchBrandingFromServer(): Promise<SiteBranding> {
    if (this.hasPendingBrandingSync()) {
      return this.getBranding();
    }

    try {
      const snap = await getDocPreferServer(doc(db, 'site_settings', 'branding'));
      if (snap.exists()) {
        const d = snap.data();
        const fsBranding: SiteBranding = {};
        if (typeof d.homeAvatar === 'string' && d.homeAvatar) fsBranding.homeAvatar = d.homeAvatar;
        if (typeof d.virtualSpacesAvatar === 'string' && d.virtualSpacesAvatar)
          fsBranding.virtualSpacesAvatar = d.virtualSpacesAvatar;
        if (typeof d.appsAvatar === 'string' && d.appsAvatar) fsBranding.appsAvatar = d.appsAvatar;
        if (typeof d.gamesAvatar === 'string' && d.gamesAvatar) fsBranding.gamesAvatar = d.gamesAvatar;
        if (typeof d.simsAvatar === 'string' && d.simsAvatar) fsBranding.simsAvatar = d.simsAvatar;
        if (typeof d.managementAvatar === 'string' && d.managementAvatar)
          fsBranding.managementAvatar = d.managementAvatar;
        if (typeof d.guidesAvatar === 'string' && d.guidesAvatar)
          fsBranding.guidesAvatar = d.guidesAvatar;
        try {
          localStorage.setItem(BRANDING_LOCAL_STORAGE_KEY, JSON.stringify(fsBranding));
        } catch {}
        return fsBranding;
      }
    } catch {}

    try {
      const res = await fetch('/api/branding', { cache: 'no-store' });
      const data = await parseJsonSafe(res);
      if (res.ok && data?.success && data.branding) {
        try {
          localStorage.setItem(BRANDING_LOCAL_STORAGE_KEY, JSON.stringify(data.branding));
        } catch {}
        if (isFirebaseAdminSignedIn() && Object.keys(data.branding).length > 0) {
          this.saveBrandingToFirestore(data.branding).catch(() => {});
        }
        return data.branding;
      }
    } catch {}

    return this.getBranding();
  }

  getBranding(): SiteBranding {
    try {
      const data = localStorage.getItem(BRANDING_LOCAL_STORAGE_KEY);
      if (!data) return {};
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  private async writeBrandingDocToFirestore(branding: SiteBranding): Promise<void> {
    const payload: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    if (branding.homeAvatar) payload.homeAvatar = branding.homeAvatar.slice(0, 500000);
    if (branding.virtualSpacesAvatar)
      payload.virtualSpacesAvatar = branding.virtualSpacesAvatar.slice(0, 500000);
    if (branding.appsAvatar) payload.appsAvatar = branding.appsAvatar.slice(0, 500000);
    if (branding.gamesAvatar) payload.gamesAvatar = branding.gamesAvatar.slice(0, 500000);
    if (branding.simsAvatar) payload.simsAvatar = branding.simsAvatar.slice(0, 500000);
    if (branding.managementAvatar)
      payload.managementAvatar = branding.managementAvatar.slice(0, 500000);
    if (branding.guidesAvatar)
      payload.guidesAvatar = branding.guidesAvatar.slice(0, 500000);

    await setDoc(doc(db, 'site_settings', 'branding'), payload);
  }

  private async saveBrandingToFirestore(branding: SiteBranding): Promise<void> {
    if (!isFirebaseAdminSignedIn()) return;
    try {
      await this.writeBrandingDocToFirestore(branding);
      this.setPendingBrandingSync(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'site_settings/branding');
    }
  }

  async saveBranding(branding: SiteBranding): Promise<{ firestoreSynced: boolean }> {
    try {
      localStorage.setItem(BRANDING_LOCAL_STORAGE_KEY, JSON.stringify(branding));
    } catch {}

    this.setPendingBrandingSync(true);

    (async () => {
      try {
        const headers = await authService.getAdminRequestHeaders();
        await fetch('/api/branding', {
          method: 'POST',
          headers,
          body: JSON.stringify(branding),
        });
      } catch {}
    })();

    if (isFirebaseAdminSignedIn()) {
      try {
        await this.writeBrandingDocToFirestore(branding);
        this.setPendingBrandingSync(false);
        return { firestoreSynced: true };
      } catch (err) {
        console.warn('Firestore branding save warning:', err);
      }
    }

    return { firestoreSynced: false };
  }

  public readonly clientId: string =
    'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

  private isTeacherFirestoreWritable(teacherId: string): boolean {
    if (!VALID_ID_REGEX.test(teacherId)) return false;
    if (teacherId === 'admin_root') {
      return isFirebaseAdminSignedIn();
    }
    return Boolean(auth.currentUser && auth.currentUser.uid === teacherId);
  }

  private getTeacherAppDocRef(teacherId: string, itemId: string) {
    if (teacherId === 'admin_root') {
      return doc(db, 'admin_app_data', itemId);
    }
    return doc(db, 'users', teacherId, 'app_data', itemId);
  }

  private getTeacherAppColRef(teacherId: string) {
    if (teacherId === 'admin_root') {
      return collection(db, 'admin_app_data');
    }
    return collection(db, 'users', teacherId, 'app_data');
  }

  private reassembleTeacherAppDataDocs(
    docs: Array<{ id: string; data: () => any; metadata?: { hasPendingWrites?: boolean } }>
  ): {
    assembled: Record<string, Record<string, string>>;
    incompleteIds: Set<string>;
    pendingWriteIds: Set<string>;
  } {
    const rawById = new Map<string, Record<string, string>>();
    const chunkDocsByBase = new Map<string, Map<number, string>>();
    const pendingWriteIds = new Set<string>();

    for (const d of docs) {
      const entries = d.data()?.entries;
      if (!entries || typeof entries !== 'object') continue;
      const chunkMarkerIdx = d.id.lastIndexOf('__chunk_');
      if (chunkMarkerIdx > 0) {
        const baseId = d.id.slice(0, chunkMarkerIdx);
        const chunkIdx = Number(d.id.slice(chunkMarkerIdx + '__chunk_'.length));
        if (Number.isInteger(chunkIdx) && chunkIdx >= 0 && typeof entries.data === 'string') {
          let m = chunkDocsByBase.get(baseId);
          if (!m) {
            m = new Map<number, string>();
            chunkDocsByBase.set(baseId, m);
          }
          m.set(chunkIdx, entries.data);
          if (d.metadata?.hasPendingWrites) {
            pendingWriteIds.add(baseId);
          }
        }
        continue;
      }

      const sanitized: Record<string, string> = {};
      for (const [k, v] of Object.entries(entries)) {
        sanitized[k] = String(v ?? '');
      }
      rawById.set(d.id, sanitized);
      if (d.metadata?.hasPendingWrites) {
        pendingWriteIds.add(d.id);
      }
    }

    const assembled: Record<string, Record<string, string>> = {};
    const incompleteIds = new Set<string>();

    for (const [itemId, entries] of rawById.entries()) {
      if (entries.__chunked === '1') {
        const expectedCount = Number(entries.__chunkCount || 0);
        const chunkMap = chunkDocsByBase.get(itemId);
        if (!Number.isInteger(expectedCount) || expectedCount <= 0 || !chunkMap || chunkMap.size < expectedCount) {
          incompleteIds.add(itemId);
          continue;
        }
        const parts: string[] = [];
        let missing = false;
        for (let i = 0; i < expectedCount; i++) {
          const part = chunkMap.get(i);
          if (typeof part !== 'string') {
            missing = true;
            break;
          }
          parts.push(part);
        }
        if (missing) {
          incompleteIds.add(itemId);
          continue;
        }
        try {
          const parsed = JSON.parse(parts.join(''));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const clean: Record<string, string> = {};
            for (const [k, v] of Object.entries(parsed)) {
              clean[k] = String(v ?? '');
            }
            assembled[itemId] = clean;
          }
        } catch {
          incompleteIds.add(itemId);
        }
      } else {
        assembled[itemId] = entries;
      }
    }

    return { assembled, incompleteIds, pendingWriteIds };
  }

  private splitAppDataForFirestore(entries: Record<string, string>): {
    isChunked: boolean;
    mainEntries: Record<string, string>;
    chunks: string[];
  } {
    const boundedEntries: Record<string, string> = {};
    for (const k of Object.keys(entries).slice(0, 500)) {
      boundedEntries[k] = String(entries[k] ?? '');
    }

    const serialized = JSON.stringify(boundedEntries);
    if (getUtf8ByteLength(serialized) <= 350_000) {
      return { isChunked: false, mainEntries: boundedEntries, chunks: [] };
    }

    const chunks = splitStringByUtf8Bytes(serialized, 320_000).slice(0, 120);
    return {
      isChunked: true,
      mainEntries: {
        __chunked: '1',
        __chunkCount: String(chunks.length),
        __updatedAt: String(Date.now()),
      },
      chunks,
    };
  }

  async getTeacherAppData(teacherId: string): Promise<Record<string, Record<string, string>>> {
    if (!teacherId) return {};
    const cacheKey = `hoclieuso_teacher_data_${teacherId}`;
    const merged: Record<string, Record<string, string>> = {};

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          Object.assign(merged, parsed);
        }
      }
    } catch {}

    const expressPromise = fetch(`/api/teacher-app-data/${encodeURIComponent(teacherId)}`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        const json = await parseJsonSafe(res);
        return res.ok && json?.success && json.data && typeof json.data === 'object'
          ? (json.data as Record<string, Record<string, string>>)
          : null;
      })
      .catch(() => null);

    const firestorePromise = (async (): Promise<Record<string, Record<string, string>> | null> => {
      try {
        await (auth as any).authStateReady?.();
      } catch {}
      if (!this.isTeacherFirestoreWritable(teacherId)) return null;
      try {
        const colRef = this.getTeacherAppColRef(teacherId);
        const snap = await getDocsPreferServer(colRef);
        const { assembled } = this.reassembleTeacherAppDataDocs(snap.docs);
        return assembled;
      } catch (err) {
        console.warn('Firestore teacher app_data read warning:', err);
        return null;
      }
    })();

    const [expressMap, fsMap] = await Promise.all([expressPromise, firestorePromise]);

    if (expressMap) {
      for (const [k, v] of Object.entries(expressMap)) {
        merged[k] = { ...(merged[k] || {}), ...(v || {}) };
      }
    }

    if (fsMap) {
      // Cloud Firestore is authoritative across browsers & computers for items already stored in cloud
      for (const [k, v] of Object.entries(fsMap)) {
        merged[k] = { ...(v || {}) };
      }
      for (const [itemId, itemEntries] of Object.entries(merged)) {
        if (itemEntries && Object.keys(itemEntries).length > 0 && !Object.prototype.hasOwnProperty.call(fsMap, itemId)) {
          this.appDataSnapshots.set(`${teacherId}:${itemId}`, { ...itemEntries });
          this.enqueueFirestoreAppWrite(teacherId, itemId);
        }
      }
    }

    for (const [itemId, itemEntries] of Object.entries(merged)) {
      this.appDataSnapshots.set(`${teacherId}:${itemId}`, { ...itemEntries });
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify(merged));
    } catch {}

    return merged;
  }

  private enqueueFirestoreAppWrite(teacherId: string, itemId: string): void {
    if (!VALID_ID_REGEX.test(itemId)) {
      return;
    }

    const opKey = `${teacherId}:${itemId}`;
    const prevQueue = this.pendingAppWrites.get(opKey) || Promise.resolve();

    const nextWrite = prevQueue
      .catch(() => {})
      .then(async () => {
        try {
          await (auth as any).authStateReady?.();
        } catch {}
        if (!this.isTeacherFirestoreWritable(teacherId)) {
          return;
        }

        const latestMap = this.appDataSnapshots.get(opKey) || {};
        const { isChunked, mainEntries, chunks } = this.splitAppDataForFirestore(latestMap);
        const docRef = this.getTeacherAppDocRef(teacherId, itemId);

        if (!isChunked) {
          await setDoc(docRef, {
            entries: mainEntries,
            updatedAt: serverTimestamp(),
          });
          // Clean up any prior chunk docs for this itemId if payload shrunk
          for (let idx = 0; idx < 120; idx++) {
            const chunkRef = this.getTeacherAppDocRef(teacherId, `${itemId}__chunk_${idx}`);
            const snap = await getDoc(chunkRef).catch(() => null);
            if (!snap || !snap.exists()) break;
            await deleteDoc(chunkRef).catch(() => {});
          }
          return;
        }

        // Write chunk docs first, then update parent doc referencing chunkCount
        for (let i = 0; i < chunks.length; i += 4) {
          const batch = writeBatch(db);
          const slice = chunks.slice(i, i + 4);
          slice.forEach((chunkStr, offset) => {
            const idx = i + offset;
            const chunkRef = this.getTeacherAppDocRef(teacherId, `${itemId}__chunk_${idx}`);
            batch.set(chunkRef, {
              entries: { data: chunkStr },
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
        }

        await setDoc(docRef, {
          entries: mainEntries,
          updatedAt: serverTimestamp(),
        });

        for (let idx = chunks.length; idx < 120; idx++) {
          const chunkRef = this.getTeacherAppDocRef(teacherId, `${itemId}__chunk_${idx}`);
          const snap = await getDoc(chunkRef).catch(() => null);
          if (!snap || !snap.exists()) break;
          await deleteDoc(chunkRef).catch(() => {});
        }
      })
      .catch((err) => {
        console.warn('Firestore teacher app_data save warning:', err);
      });

    this.pendingAppWrites.set(opKey, nextWrite);
  }

  async mutateTeacherAppData(
    teacherId: string,
    itemId: string,
    payload: {
      op: 'set' | 'remove' | 'clear' | 'replace';
      key?: string;
      value?: string;
      data?: Record<string, string>;
    }
  ): Promise<Record<string, string> | null> {
    if (!teacherId || !itemId) return null;

    const opKey = `${teacherId}:${itemId}`;
    const cacheKey = `hoclieuso_teacher_data_${teacherId}`;
    let updatedItemMap: Record<string, string> = {};

    try {
      const raw = localStorage.getItem(cacheKey);
      const cachedAll: Record<string, Record<string, string>> = raw ? JSON.parse(raw) : {};
      const baseMap = this.appDataSnapshots.get(opKey) || cachedAll[itemId] || {};
      const itemMap = { ...baseMap };

      if (payload.op === 'set' && typeof payload.key === 'string') {
        itemMap[payload.key] = String(payload.value ?? '');
      } else if (payload.op === 'remove' && typeof payload.key === 'string') {
        delete itemMap[payload.key];
      } else if (payload.op === 'clear') {
        for (const k of Object.keys(itemMap)) delete itemMap[k];
      } else if (payload.op === 'replace' && payload.data) {
        for (const k of Object.keys(itemMap)) delete itemMap[k];
        Object.assign(itemMap, payload.data);
      }

      updatedItemMap = itemMap;
      this.appDataSnapshots.set(opKey, { ...itemMap });
      cachedAll[itemId] = itemMap;
      localStorage.setItem(cacheKey, JSON.stringify(cachedAll));
    } catch {}

    this.enqueueFirestoreAppWrite(teacherId, itemId);

    try {
      const headers = await authService.getAdminRequestHeaders();
      const res = await fetch(
        `/api/teacher-app-data/${encodeURIComponent(teacherId)}/${encodeURIComponent(itemId)}`,
        {
          method: 'POST',
          headers,
          keepalive: true,
          body: JSON.stringify({
            ...payload,
            clientId: this.clientId,
          }),
        }
      );
      const json = await parseJsonSafe(res);
      if (res.ok && json?.success) {
        return json.data;
      }
    } catch {}

    return updatedItemMap;
  }

  subscribeTeacherAppDataRealtime(
    teacherId: string,
    onItemUpdate: (itemId: string, entries: Record<string, string>) => void
  ): () => void {
    if (!teacherId || !this.isTeacherFirestoreWritable(teacherId)) {
      return () => {};
    }
    try {
      const colRef = this.getTeacherAppColRef(teacherId);
      return onSnapshot(
        colRef,
        (snap) => {
          const cacheKey = `hoclieuso_teacher_data_${teacherId}`;
          let cachedAll: Record<string, Record<string, string>> = {};
          try {
            const raw = localStorage.getItem(cacheKey);
            if (raw) cachedAll = JSON.parse(raw) || {};
          } catch {}

          const { assembled, incompleteIds, pendingWriteIds } =
            this.reassembleTeacherAppDataDocs(snap.docs);
          let cacheChanged = false;

          // Emit removed logical items
          snap.docChanges().forEach((change) => {
            if (change.type !== 'removed') return;
            const docId = change.doc.id;
            if (docId.includes('__chunk_')) return;
            const opKey = `${teacherId}:${docId}`;
            this.appDataSnapshots.set(opKey, {});
            if (cachedAll[docId]) {
              delete cachedAll[docId];
              cacheChanged = true;
            }
            if (!change.doc.metadata.hasPendingWrites) {
              onItemUpdate(docId, {});
            }
          });

          for (const [itemId, entries] of Object.entries(assembled)) {
            if (incompleteIds.has(itemId)) continue;
            const opKey = `${teacherId}:${itemId}`;
            const prevSnap = this.appDataSnapshots.get(opKey);
            const prevJson = prevSnap ? JSON.stringify(prevSnap) : '';
            const nextJson = JSON.stringify(entries);
            if (prevJson === nextJson) continue;
            this.appDataSnapshots.set(opKey, { ...entries });
            cachedAll[itemId] = entries;
            cacheChanged = true;
            if (!pendingWriteIds.has(itemId)) {
              onItemUpdate(itemId, entries);
            }
          }

          if (cacheChanged) {
            try {
              localStorage.setItem(cacheKey, JSON.stringify(cachedAll));
            } catch {}
          }
        },
        (err) => {
          console.warn('Firestore teacher app_data snapshot warning:', err);
        }
      );
    } catch {
      return () => {};
    }
  }

  subscribeItemsRealtime(onItems: (items: ContentItem[]) => void): () => void {
    try {
      const q = query(
        collection(db, 'content_items'),
        where('zone', 'in', ALL_ZONES)
      );
      return onSnapshot(
        q,
        async (snap) => {
          const items = await this.hydrateFirestoreDocs(snap.docs);

          const itemIds = new Set(items.map((i) => i.id));
          for (const id of itemIds) {
            if (BUNDLED_ADDON_IDS.has(id)) {
              addIdToLocalStorageSet(SEEN_FS_ADDON_STORAGE_KEY, id);
              this.pendingAddonItems.delete(id);
            }
          }

          if (this.pendingAddonItems.size > 0) {
            const deletedAddons = readIdSetFromLocalStorage(DELETED_ADDON_STORAGE_KEY);
            const seenFsAddons = readIdSetFromLocalStorage(SEEN_FS_ADDON_STORAGE_KEY);
            for (const [addonId, addonItem] of this.pendingAddonItems.entries()) {
              if (!itemIds.has(addonId) && !deletedAddons.has(addonId) && !seenFsAddons.has(addonId)) {
                items.push(addonItem);
                itemIds.add(addonId);
              }
            }
          }

          const bundledMap = new Map(this.getBundledDefaultItems().map((b) => [b.id, b]));
          for (let idx = 0; idx < items.length; idx++) {
            const bundled = bundledMap.get(items[idx].id);
            if (bundled && shouldUpgradeBundledAddon(items[idx], bundled)) {
              items[idx] = bundled;
            }
          }

          items.sort((a, b) => (a.order || 0) - (b.order || 0));

          const withPending = await this.applyPendingMutations(items);

          if (withPending.length > 0) {
            this.syncLocalCache(withPending).catch(() => {});
            onItems(withPending);
            return;
          }

          try {
            const catalogSnap = await getDocPreferServer(doc(db, 'site_settings', 'catalog'));
            if (catalogSnap.exists() && catalogSnap.data()?.initialized === true) {
              this.syncLocalCache([]).catch(() => {});
              onItems([]);
            }
          } catch {}
        },
        (err) => {
          console.warn('Firestore items snapshot warning:', err);
        }
      );
    } catch {
      return () => {};
    }
  }

  subscribeBrandingRealtime(onBranding: (branding: SiteBranding) => void): () => void {
    try {
      return onSnapshot(
        doc(db, 'site_settings', 'branding'),
        (snap) => {
          if (!snap.exists()) return;
          if (this.hasPendingBrandingSync()) return;
          const d = snap.data();
          const fsBranding: SiteBranding = {};
          if (typeof d.homeAvatar === 'string' && d.homeAvatar) fsBranding.homeAvatar = d.homeAvatar;
          if (typeof d.virtualSpacesAvatar === 'string' && d.virtualSpacesAvatar)
            fsBranding.virtualSpacesAvatar = d.virtualSpacesAvatar;
          if (typeof d.appsAvatar === 'string' && d.appsAvatar) fsBranding.appsAvatar = d.appsAvatar;
          if (typeof d.gamesAvatar === 'string' && d.gamesAvatar) fsBranding.gamesAvatar = d.gamesAvatar;
          if (typeof d.simsAvatar === 'string' && d.simsAvatar) fsBranding.simsAvatar = d.simsAvatar;
          if (typeof d.managementAvatar === 'string' && d.managementAvatar)
            fsBranding.managementAvatar = d.managementAvatar;
          if (typeof d.guidesAvatar === 'string' && d.guidesAvatar)
            fsBranding.guidesAvatar = d.guidesAvatar;
          try {
            localStorage.setItem(BRANDING_LOCAL_STORAGE_KEY, JSON.stringify(fsBranding));
          } catch {}
          onBranding(fsBranding);
        },
        (err) => {
          console.warn('Firestore branding snapshot warning:', err);
        }
      );
    } catch {
      return () => {};
    }
  }

  subscribeRealtime(onEvent: (event: any) => void): () => void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return () => {};
    }

    let errorCount = 0;
    const es = new EventSource('/api/realtime');
    es.onopen = () => {
      errorCount = 0;
    };
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        onEvent(parsed);
      } catch {}
    };
    es.onerror = () => {
      errorCount += 1;
      if (errorCount >= 2) {
        es.close();
      }
    };

    return () => {
      es.close();
    };
  }
}

export const storageService = new StorageService();
