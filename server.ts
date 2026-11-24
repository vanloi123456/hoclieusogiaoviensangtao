import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';

function resolveServerPort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      const next = Number(args[i + 1]);
      if (Number.isInteger(next) && next > 0 && next <= 65535) return next;
    } else if (arg.startsWith('--port=')) {
      const val = Number(arg.slice('--port='.length));
      if (Number.isInteger(val) && val > 0 && val <= 65535) return val;
    }
  }

  const npmPort = Number(process.env.npm_config_port);
  if (Number.isInteger(npmPort) && npmPort > 0 && npmPort <= 65535) {
    return npmPort;
  }

  const envPort = Number(process.env.PORT);
  if (Number.isInteger(envPort) && envPort > 0 && envPort <= 65535) {
    // In AI Studio dev containers, PORT=8080 is used by the outer nginx proxy which forwards to 3000.
    if (!isProduction && envPort === 8080) {
      return 3000;
    }
    return envPort;
  }

  return 3000;
}

const PORT = resolveServerPort();

const DATA_DIR = path.resolve(__dirname, 'data');
const TEACHERS_FILE = path.join(DATA_DIR, 'teachers.json');
const PUBLIC_SEED_TEACHERS_FILE = path.resolve(__dirname, 'public', 'seed-teachers.json');
const BRANDING_FILE = path.join(DATA_DIR, 'branding.json');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const PUBLIC_SEED_ITEMS_FILE = path.resolve(__dirname, 'public', 'seed-items.json');
const TEACHER_APP_DATA_FILE = path.join(DATA_DIR, 'teacher_app_data.json');
const FIREBASE_CONFIG_FILE = path.resolve(__dirname, 'firebase-applet-config.json');

const INITIAL_FREE_CREDITS = 20;
const DAILY_FREE_CREDITS = 20;
const DAILY_FREE_RESET_MS = 24 * 60 * 60 * 1000;
const CREDIT_COST_STANDARD_ACCESS = 4;
const MAX_CUSTOM_CREDIT_COST = 100000;

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

function getFirebaseConfig(): FirebaseAppletConfig | null {
  try {
    if (!fs.existsSync(FIREBASE_CONFIG_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_FILE, 'utf-8'));
    if (raw?.projectId && raw?.apiKey && raw?.firestoreDatabaseId) {
      return {
        projectId: String(raw.projectId),
        apiKey: String(raw.apiKey),
        firestoreDatabaseId: String(raw.firestoreDatabaseId),
      };
    }
    return null;
  } catch {
    return null;
  }
}

const firebaseConfig = getFirebaseConfig();

const REMOVED_SERVER_ITEM_IDS = new Set([
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

function isRemovedServerItem(item: any): boolean {
  if (!item || typeof item !== 'object') return true;
  const id = String(item.id || '').trim();
  if (REMOVED_SERVER_ITEM_IDS.has(id)) return true;
  const lowerTitle = String(item.title || '').trim().toLowerCase();
  return (
    lowerTitle.includes('kéo co kiến thức') ||
    lowerTitle.includes('kéo co - chinh phục') ||
    lowerTitle.includes('chinh phục tri thức')
  );
}

function getStoredItems(): any[] {
  try {
    if (!fs.existsSync(ITEMS_FILE)) return [];
    const content = fs.readFileSync(ITEMS_FILE, 'utf-8');
    const parsed = JSON.parse(content) || [];
    return Array.isArray(parsed) ? parsed.filter((item) => !isRemovedServerItem(item)) : [];
  } catch (err) {
    console.error('Error reading items.json:', err);
    return [];
  }
}

function saveStoredItems(items: any[]): void {
  const serialized = JSON.stringify(items, null, 2);
  try {
    fs.writeFileSync(ITEMS_FILE, serialized, 'utf-8');
  } catch (err) {
    console.error('Error writing items.json:', err);
  }
  try {
    const publicDir = path.dirname(PUBLIC_SEED_ITEMS_FILE);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(PUBLIC_SEED_ITEMS_FILE, serialized, 'utf-8');
  } catch (err) {
    console.warn('Error syncing public/seed-items.json:', err);
  }
}

// Helpers for reading and writing teachers
interface StoredTeacher {
  id: string;
  email: string;
  fullName: string;
  photoURL?: string;
  school?: string;
  role: 'teacher';
  status: 'active' | 'blocked';
  credits: number;
  usedCredits: number;
  lastFreeResetAt?: number;
  createdAt: number;
  updatedAt?: number;
}

function normalizeTeacher(teacher: any): StoredTeacher {
  const now = Date.now();
  let credits = INITIAL_FREE_CREDITS;
  if (typeof teacher.credits === 'number' && Number.isFinite(teacher.credits)) {
    credits = Math.max(0, Math.floor(teacher.credits));
  } else if (
    typeof teacher.freeCredits === 'number' ||
    typeof teacher.paidCredits === 'number'
  ) {
    credits = Math.max(
      0,
      Math.floor((teacher.freeCredits || 0) + (teacher.paidCredits || 0))
    );
  }

  const usedCredits =
    typeof teacher.usedCredits === 'number' && Number.isFinite(teacher.usedCredits)
      ? Math.max(0, Math.floor(teacher.usedCredits))
      : 0;

  const createdAt = typeof teacher.createdAt === 'number' ? teacher.createdAt : now;
  const lastFreeResetAt =
    typeof teacher.lastFreeResetAt === 'number' && Number.isFinite(teacher.lastFreeResetAt)
      ? teacher.lastFreeResetAt
      : createdAt;

  return {
    id: String(teacher.id),
    email: String(teacher.email || '').trim().toLowerCase(),
    fullName: teacher.fullName || 'Giáo viên',
    photoURL: teacher.photoURL,
    school: teacher.school,
    role: 'teacher',
    status: teacher.status === 'blocked' ? 'blocked' : 'active',
    credits,
    usedCredits,
    lastFreeResetAt,
    createdAt,
    updatedAt: teacher.updatedAt || now,
  };
}

function applyDailyFreeCreditReset(teacher: StoredTeacher, now = Date.now()): boolean {
  const lastReset =
    typeof teacher.lastFreeResetAt === 'number' && Number.isFinite(teacher.lastFreeResetAt)
      ? teacher.lastFreeResetAt
      : teacher.createdAt || now;
  if (now - lastReset >= DAILY_FREE_RESET_MS) {
    teacher.lastFreeResetAt = now;
    if (teacher.credits < DAILY_FREE_CREDITS) {
      teacher.credits = DAILY_FREE_CREDITS;
    }
    teacher.updatedAt = now;
    return true;
  }
  return false;
}

function getStoredTeachers(): StoredTeacher[] {
  try {
    if (!fs.existsSync(TEACHERS_FILE)) return [];
    const content = fs.readFileSync(TEACHERS_FILE, 'utf-8');
    const raw = JSON.parse(content) || [];
    return Array.isArray(raw) ? raw.map(normalizeTeacher) : [];
  } catch (err) {
    console.error('Error reading teachers.json:', err);
    return [];
  }
}

function saveStoredTeachers(teachers: StoredTeacher[]): void {
  const serialized = JSON.stringify(teachers, null, 2);
  try {
    fs.writeFileSync(TEACHERS_FILE, serialized, 'utf-8');
  } catch (err) {
    console.error('Error writing teachers.json:', err);
  }
  try {
    const publicDir = path.dirname(PUBLIC_SEED_TEACHERS_FILE);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(PUBLIC_SEED_TEACHERS_FILE, serialized, 'utf-8');
  } catch (err) {
    console.warn('Error syncing public/seed-teachers.json:', err);
  }
}

function getStoredBranding(): any {
  try {
    if (!fs.existsSync(BRANDING_FILE)) return {};
    const content = fs.readFileSync(BRANDING_FILE, 'utf-8');
    return JSON.parse(content) || {};
  } catch {
    return {};
  }
}

function saveStoredBranding(data: any): void {
  try {
    fs.writeFileSync(BRANDING_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing branding.json:', err);
  }
}

type TeacherAppDataMap = Record<string, Record<string, Record<string, string>>>;

function getStoredTeacherAppData(): TeacherAppDataMap {
  try {
    if (!fs.existsSync(TEACHER_APP_DATA_FILE)) return {};
    const content = fs.readFileSync(TEACHER_APP_DATA_FILE, 'utf-8');
    return JSON.parse(content) || {};
  } catch (err) {
    console.error('Error reading teacher_app_data.json:', err);
    return {};
  }
}

function saveStoredTeacherAppData(data: TeacherAppDataMap): void {
  try {
    fs.writeFileSync(TEACHER_APP_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing teacher_app_data.json:', err);
  }
}

const ADMIN_CREDENTIALS = {
  email: 'vanloiphuhiep.09@gmail.com',
  password: 'Quantri@26',
};

// --- Firebase Auth ID Token Verification & Firestore REST Helpers ---
interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  photoUrl?: string;
  idToken: string;
}

function extractBearerToken(authHeader?: string | string[]): string | null {
  if (!authHeader || Array.isArray(authHeader)) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function verifyFirebaseIdToken(
  authHeader?: string | string[]
): Promise<VerifiedFirebaseUser | null> {
  const idToken = extractBearerToken(authHeader);
  if (!idToken || !firebaseConfig?.apiKey) return null;

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
        firebaseConfig.apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const user = data?.users?.[0];
    if (!user?.localId || !user?.email) return null;
    return {
      uid: String(user.localId),
      email: String(user.email).trim().toLowerCase(),
      emailVerified: Boolean(user.emailVerified),
      displayName: user.displayName ? String(user.displayName) : undefined,
      photoUrl: user.photoUrl ? String(user.photoUrl) : undefined,
      idToken,
    };
  } catch (err) {
    console.warn('Firebase token verification error:', err);
    return null;
  }
}

function firestoreDocPath(collection: string, docId: string): string {
  return `projects/${firebaseConfig!.projectId}/databases/${firebaseConfig!.firestoreDatabaseId}/documents/${collection}/${encodeURIComponent(
    docId
  )}`;
}

function firestoreDocUrl(collection: string, docId: string): string {
  return `https://firestore.googleapis.com/v1/${firestoreDocPath(collection, docId)}`;
}

function firestoreCommitUrl(): string {
  return `https://firestore.googleapis.com/v1/projects/${firebaseConfig!.projectId}/databases/${firebaseConfig!.firestoreDatabaseId}:commit`;
}

async function fetchFirestoreDoc(
  collection: string,
  docId: string,
  idToken: string
): Promise<any | null> {
  if (!firebaseConfig) return null;
  try {
    const resp = await fetch(firestoreDocUrl(collection, docId), {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function fetchFirestoreCollectionDocs(
  collection: string,
  idToken: string
): Promise<any[] | null> {
  if (!firebaseConfig) return null;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${collection}?pageSize=300`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return Array.isArray(data?.documents) ? data.documents : [];
  } catch {
    return null;
  }
}

function readFsInt(field: any, fallback = 0): number {
  if (!field) return fallback;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return Math.floor(Number(field.doubleValue));
  return fallback;
}

function readFsString(field: any): string | null {
  if (!field || field.nullValue !== undefined) return null;
  return typeof field.stringValue === 'string' ? field.stringValue : null;
}

function readFsTimestamp(field: any, fallback: number): number {
  if (!field) return fallback;
  if (typeof field.timestampValue === 'string') {
    const parsed = Date.parse(field.timestampValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (field.integerValue !== undefined) return Number(field.integerValue);
  return fallback;
}

function mapFirestoreDocToTeacher(fsDoc: any, now = Date.now()): StoredTeacher | null {
  if (!fsDoc?.fields) return null;
  const nameParts = typeof fsDoc.name === 'string' ? fsDoc.name.split('/') : [];
  const docId = readFsString(fsDoc.fields.uid) || nameParts[nameParts.length - 1] || '';
  const email = (readFsString(fsDoc.fields.email) || '').trim().toLowerCase();
  if (!docId || !email) return null;
  const createdAt = readFsTimestamp(fsDoc.fields.createdAt, now);
  return {
    id: docId,
    email,
    fullName: readFsString(fsDoc.fields.fullName) || 'Giáo viên',
    photoURL: readFsString(fsDoc.fields.photoURL) || undefined,
    role: 'teacher',
    status: 'active',
    credits: Math.max(0, readFsInt(fsDoc.fields.credits, INITIAL_FREE_CREDITS)),
    usedCredits: Math.max(0, readFsInt(fsDoc.fields.usedCredits, 0)),
    lastFreeResetAt: readFsTimestamp(fsDoc.fields.lastFreeResetAt, createdAt),
    createdAt,
    updatedAt: readFsTimestamp(fsDoc.fields.updatedAt, now),
  };
}

async function syncFirestoreDailyResetIfDue(
  fsDoc: any,
  targetUid: string,
  idToken: string,
  now = Date.now()
): Promise<any> {
  if (!fsDoc?.fields || !firebaseConfig) return fsDoc;
  const fsCredits = readFsInt(fsDoc.fields.credits, INITIAL_FREE_CREDITS);
  const fsCreatedAt = readFsTimestamp(fsDoc.fields.createdAt, now);
  const fsLastReset = readFsTimestamp(fsDoc.fields.lastFreeResetAt, fsCreatedAt);

  if (now - fsLastReset >= DAILY_FREE_RESET_MS && fsCredits < DAILY_FREE_CREDITS) {
    const commitResp = await fetch(firestoreCommitUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: firestoreDocPath('users', targetUid),
              fields: {
                credits: { integerValue: String(DAILY_FREE_CREDITS) },
              },
            },
            updateMask: { fieldPaths: ['credits'] },
            updateTransforms: [
              { fieldPath: 'lastFreeResetAt', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
            ],
            currentDocument: { updateTime: fsDoc.updateTime },
          },
        ],
      }),
    }).catch(() => null);

    if (commitResp?.ok) {
      const refreshed = await fetchFirestoreDoc('users', targetUid, idToken);
      if (refreshed) return refreshed;
    } else if (commitResp) {
      console.warn('Firestore 24h reset commit rejected:', await commitResp.text().catch(() => ''));
    }
  }
  return fsDoc;
}

async function verifyAdminRequest(req: express.Request): Promise<{
  isAdmin: boolean;
  adminEmail: string;
  idToken?: string;
}> {
  const verified = await verifyFirebaseIdToken(req.headers.authorization);
  if (verified && verified.email === ADMIN_CREDENTIALS.email.toLowerCase()) {
    return { isAdmin: true, adminEmail: verified.email, idToken: verified.idToken };
  }

  const headerEmail = String(req.headers['x-admin-email'] || '').trim().toLowerCase();
  const headerPass = String(req.headers['x-admin-password'] || '');
  if (
    headerEmail === ADMIN_CREDENTIALS.email.toLowerCase() &&
    headerPass === ADMIN_CREDENTIALS.password
  ) {
    return { isAdmin: true, adminEmail: ADMIN_CREDENTIALS.email };
  }

  return { isAdmin: false, adminEmail: '' };
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // --- Real-time SSE clients ---
  const sseClients = new Set<express.Response>();

  function broadcastRealtime(payload: Record<string, any>): void {
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(line);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  app.get('/api/realtime', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // --- API Endpoints ---

  // 1. Get all teachers (for Admin panel) — sync from Cloud Firestore if Admin token present
  app.get('/api/teachers', async (req, res) => {
    const adminCheck = await verifyAdminRequest(req);
    if (!adminCheck.isAdmin) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập danh sách người dùng' });
    }
    const teachers = getStoredTeachers();
    const now = Date.now();
    let changed = false;

    if (adminCheck.idToken && firebaseConfig) {
      const fsDocs = await fetchFirestoreCollectionDocs('users', adminCheck.idToken);
      if (Array.isArray(fsDocs) && fsDocs.length > 0) {
        for (const fsDoc of fsDocs) {
          const fsTeacher = mapFirestoreDocToTeacher(fsDoc, now);
          if (!fsTeacher) continue;
          const idx = teachers.findIndex(
            (t) => t.id === fsTeacher.id || t.email.toLowerCase() === fsTeacher.email
          );
          if (idx === -1) {
            teachers.push(fsTeacher);
            changed = true;
          } else {
            const local = teachers[idx];
            if (
              local.credits !== fsTeacher.credits ||
              local.usedCredits !== fsTeacher.usedCredits ||
              local.lastFreeResetAt !== fsTeacher.lastFreeResetAt ||
              local.fullName !== fsTeacher.fullName ||
              local.photoURL !== fsTeacher.photoURL
            ) {
              teachers[idx] = {
                ...local,
                id: fsTeacher.id,
                fullName: fsTeacher.fullName || local.fullName,
                photoURL: fsTeacher.photoURL || local.photoURL,
                credits: fsTeacher.credits,
                usedCredits: fsTeacher.usedCredits,
                lastFreeResetAt: fsTeacher.lastFreeResetAt,
                updatedAt: Math.max(local.updatedAt || 0, fsTeacher.updatedAt || 0),
              };
              changed = true;
            }
          }
        }
      }
    }

    for (const teacher of teachers) {
      if (applyDailyFreeCreditReset(teacher, now)) {
        changed = true;
      }
    }

    if (changed) {
      saveStoredTeachers(teachers);
    }
    res.json({ success: true, teachers });
  });

  // 1b. Get current authenticated user's profile & credits (authoritative cloud sync + 24h daily reset)
  app.get('/api/auth/me', async (req, res) => {
    const verified = await verifyFirebaseIdToken(req.headers.authorization);
    const uid = verified?.uid || (typeof req.query.uid === 'string' ? req.query.uid : '');
    if (!uid) {
      return res.status(401).json({ success: false, message: 'Chưa xác thực tài khoản' });
    }
    const now = Date.now();
    const teachers = getStoredTeachers();
    let idx = teachers.findIndex((t) => t.id === uid);

    let fsDoc: any = null;
    if (verified && firebaseConfig) {
      fsDoc = await fetchFirestoreDoc('users', uid, verified.idToken);
      fsDoc = await syncFirestoreDailyResetIfDue(fsDoc, uid, verified.idToken, now);
    }

    if (idx === -1 && fsDoc?.fields) {
      const mapped = mapFirestoreDocToTeacher(fsDoc, now);
      if (mapped) {
        teachers.push(mapped);
        idx = teachers.length - 1;
        saveStoredTeachers(teachers);
      }
    }

    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ người dùng' });
    }

    const found = teachers[idx];
    let changed = applyDailyFreeCreditReset(found, now);

    if (fsDoc?.fields?.credits !== undefined) {
      const fsCredits = Math.max(0, readFsInt(fsDoc.fields.credits, found.credits));
      const fsUsedCredits = Math.max(0, readFsInt(fsDoc.fields.usedCredits, found.usedCredits || 0));
      const fsReset = readFsTimestamp(
        fsDoc.fields.lastFreeResetAt,
        found.lastFreeResetAt || found.createdAt || now
      );
      if (
        fsCredits !== found.credits ||
        fsUsedCredits !== (found.usedCredits || 0) ||
        fsReset > (found.lastFreeResetAt || 0)
      ) {
        found.credits = fsCredits;
        found.usedCredits = fsUsedCredits;
        found.lastFreeResetAt = fsReset;
        found.updatedAt = now;
        changed = true;
      }
    }

    if (changed) {
      teachers[idx] = found;
      saveStoredTeachers(teachers);
      broadcastRealtime({ type: 'teachers_updated', teacherId: found.id, ts: now });
    }

    res.json({ success: true, user: found });
  });

  // 2. Sync Google Authenticated User (20 daily free credits, automatically refreshed every 24 hours)
  app.post('/api/auth/google', async (req, res) => {
    try {
      const verified = await verifyFirebaseIdToken(req.headers.authorization);
      const body = req.body || {};

      const uid = verified ? verified.uid : String(body.uid || '').trim();
      const email = verified
        ? verified.email
        : String(body.email || '').trim().toLowerCase();
      const fullName =
        String(body.fullName || verified?.displayName || '').trim() ||
        email.split('@')[0] ||
        'Giáo viên';
      const photoURL = verified?.photoUrl || body.photoURL || undefined;

      if (!uid || !email) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin tài khoản Google' });
      }

      if (email === ADMIN_CREDENTIALS.email.toLowerCase()) {
        const adminUser = {
          id: 'admin_root',
          email: ADMIN_CREDENTIALS.email,
          fullName: fullName || 'Quản trị viên Hệ thống',
          photoURL,
          role: 'admin',
          status: 'active',
          credits: 999999,
          createdAt: 1700000000000,
        };
        return res.json({ success: true, user: adminUser, isNewUser: false });
      }

      const now = Date.now();

      // Check Firestore doc if verified idToken is supplied & trigger 24h daily reset if due
      let firestoreCredits: number | null = null;
      let firestoreUsedCredits: number | null = null;
      let firestoreLastResetAt: number | null = null;
      if (verified && firebaseConfig) {
        let fsDoc = await fetchFirestoreDoc('users', uid, verified.idToken);
        fsDoc = await syncFirestoreDailyResetIfDue(fsDoc, uid, verified.idToken, now);
        if (fsDoc?.fields?.credits !== undefined) {
          firestoreCredits = Math.max(0, readFsInt(fsDoc.fields.credits, INITIAL_FREE_CREDITS));
          firestoreUsedCredits = Math.max(0, readFsInt(fsDoc.fields.usedCredits, 0));
          firestoreLastResetAt = readFsTimestamp(
            fsDoc.fields.lastFreeResetAt,
            readFsTimestamp(fsDoc.fields.createdAt, now)
          );
        }
      }

      const teachers = getStoredTeachers();
      const idx = teachers.findIndex(
        (t) => t.id === uid || t.email.toLowerCase() === email
      );

      let isNewUser = false;
      let user: StoredTeacher;

      if (idx === -1) {
        const initialCredits =
          firestoreCredits !== null
            ? firestoreCredits
            : INITIAL_FREE_CREDITS;
        const initialUsedCredits =
          firestoreUsedCredits !== null
            ? firestoreUsedCredits
            : 0;

        user = {
          id: uid,
          email,
          fullName,
          photoURL,
          role: 'teacher',
          status: 'active',
          credits: initialCredits,
          usedCredits: initialUsedCredits,
          lastFreeResetAt: firestoreLastResetAt ?? now,
          createdAt: now,
          updatedAt: now,
        };
        teachers.push(user);
        isNewUser = true;
      } else {
        const existing = teachers[idx];
        existing.id = uid;
        existing.role = 'teacher';
        existing.status = 'active';
        existing.fullName = fullName || existing.fullName;
        if (photoURL) existing.photoURL = photoURL;

        // Authoritatively adopt Firestore cloud state across browsers/PCs when verified
        if (firestoreCredits !== null) {
          existing.credits = firestoreCredits;
        }
        if (firestoreUsedCredits !== null) {
          existing.usedCredits = firestoreUsedCredits;
        }
        if (firestoreLastResetAt) {
          existing.lastFreeResetAt = firestoreLastResetAt;
        }
        applyDailyFreeCreditReset(existing, now);
        existing.updatedAt = now;
        teachers[idx] = existing;
        user = existing;
      }

      saveStoredTeachers(teachers);
      broadcastRealtime({ type: 'teachers_updated', teacherId: user.id, ts: now });

      res.json({
        success: true,
        user,
        isNewUser,
        message: isNewUser
          ? `Đăng nhập thành công! Tài khoản mới nhận được ${INITIAL_FREE_CREDITS} tín dụng AI miễn phí mỗi ngày (tự động làm mới sau 24 giờ).`
          : 'Đăng nhập thành công!',
      });
    } catch (err: any) {
      console.error('Google auth sync error:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đồng bộ tài khoản' });
    }
  });

  // 3. Admin Email/Password Login
  app.post('/api/login', (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu' });
      }

      const cleanEmail = String(email).trim().toLowerCase();

      if (cleanEmail === ADMIN_CREDENTIALS.email.toLowerCase()) {
        if (password === ADMIN_CREDENTIALS.password) {
          const adminUser = {
            id: 'admin_root',
            email: ADMIN_CREDENTIALS.email,
            fullName: 'Quản trị viên Hệ thống',
            role: 'admin',
            status: 'active',
            credits: 999999,
            createdAt: 1700000000000,
          };
          return res.json({ success: true, message: 'Đăng nhập Quản trị viên thành công', user: adminUser });
        }
        return res.status(401).json({ success: false, message: 'Mật khẩu quản trị viên không chính xác' });
      }

      return res.status(400).json({
        success: false,
        message: 'Vui lòng sử dụng tài khoản Google để đăng nhập.',
      });
    } catch (err: any) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng nhập' });
    }
  });

  // 4. Consume AI Credits on backend according to zone & catalog item pricing:
  //    - virtual_spaces, apps, games, simulations: 4 AI credits
  //    - guides: 0 AI credits (free, no deduction)
  //    - management (Ứng dụng Tiện ích): per-item configurable creditCost (0 = free)
  app.post('/api/credits/consume', async (req, res) => {
    try {
      const verified = await verifyFirebaseIdToken(req.headers.authorization);
      const bodyTeacherId = req.body?.teacherId ? String(req.body.teacherId) : '';
      const rawAction = String(req.body?.action || 'access').trim().toLowerCase();
      const itemId = req.body?.itemId ? String(req.body.itemId).trim() : '';
      const bodyZone = req.body?.zone ? String(req.body.zone).trim() : '';

      if (rawAction !== 'view' && rawAction !== 'access') {
        return res.status(400).json({
          success: false,
          message: 'Loại thao tác tín dụng không hợp lệ.',
        });
      }

      const storedItems = getStoredItems();
      const matchedStoredItem = itemId
        ? storedItems.find((i) => i.id === itemId)
        : undefined;

      let resolvedZone = matchedStoredItem?.zone
        ? String(matchedStoredItem.zone)
        : bodyZone;
      let customManagementCost =
        typeof matchedStoredItem?.creditCost === 'number' &&
        Number.isFinite(matchedStoredItem.creditCost)
          ? Math.max(0, Math.min(MAX_CUSTOM_CREDIT_COST, Math.floor(matchedStoredItem.creditCost)))
          : undefined;

      if (
        (!matchedStoredItem || (resolvedZone === 'management' && customManagementCost === undefined)) &&
        itemId &&
        verified &&
        firebaseConfig
      ) {
        const fsItemDoc = await fetchFirestoreDoc('content_items', itemId, verified.idToken);
        if (fsItemDoc?.fields) {
          const fsZone = readFsString(fsItemDoc.fields.zone);
          if (fsZone) resolvedZone = fsZone;
          if (fsItemDoc.fields.creditCost !== undefined) {
            customManagementCost = Math.max(
              0,
              Math.min(MAX_CUSTOM_CREDIT_COST, readFsInt(fsItemDoc.fields.creditCost, 0))
            );
          }
        }
      }

      let cost = CREDIT_COST_STANDARD_ACCESS;
      if (resolvedZone === 'guides') {
        cost = 0;
      } else if (resolvedZone === 'management') {
        cost = customManagementCost ?? 0;
      }

      const targetUid = verified ? verified.uid : bodyTeacherId;

      if (cost === 0) {
        const existingTeacher = targetUid
          ? getStoredTeachers().find((t) => t.id === targetUid)
          : undefined;
        return res.json({
          success: true,
          deductedCredits: 0,
          user: existingTeacher,
        });
      }

      if (!targetUid) {
        return res.status(401).json({
          success: false,
          message: 'Vui lòng đăng nhập để sử dụng tính năng này.',
        });
      }

      if (verified && bodyTeacherId && verified.uid !== bodyTeacherId) {
        return res.status(403).json({
          success: false,
          message: 'Xác thực tài khoản không khớp.',
        });
      }

      const now = Date.now();
      const teachers = getStoredTeachers();
      let idx = teachers.findIndex((t) => t.id === targetUid);

      // Sync from Firestore /users/{uid} if token verified & auto-refresh 24h free credits if due
      let fsDoc: any = null;
      if (verified && firebaseConfig) {
        fsDoc = await fetchFirestoreDoc('users', targetUid, verified.idToken);
        fsDoc = await syncFirestoreDailyResetIfDue(fsDoc, targetUid, verified.idToken, now);
      }

      if (idx === -1 && verified) {
        const fsCredits = fsDoc?.fields?.credits !== undefined
          ? Math.max(0, readFsInt(fsDoc.fields.credits, INITIAL_FREE_CREDITS))
          : INITIAL_FREE_CREDITS;
        const fsUsedCredits = fsDoc?.fields?.usedCredits !== undefined
          ? Math.max(0, readFsInt(fsDoc.fields.usedCredits, 0))
          : 0;
        const fsResetAt = fsDoc?.fields
          ? readFsTimestamp(fsDoc.fields.lastFreeResetAt, readFsTimestamp(fsDoc.fields.createdAt, now))
          : now;
        const created: StoredTeacher = {
          id: verified.uid,
          email: verified.email,
          fullName: verified.displayName || verified.email.split('@')[0],
          photoURL: verified.photoUrl,
          role: 'teacher',
          status: 'active',
          credits: fsCredits,
          usedCredits: fsUsedCredits,
          lastFreeResetAt: fsResetAt,
          createdAt: now,
          updatedAt: now,
        };
        teachers.push(created);
        idx = teachers.length - 1;
      }

      if (idx === -1) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng.' });
      }

      const teacher = teachers[idx];
      if (verified && fsDoc?.fields) {
        const fsCredits = Math.max(0, readFsInt(fsDoc.fields.credits, teacher.credits));
        const fsUsedCredits = Math.max(0, readFsInt(fsDoc.fields.usedCredits, teacher.usedCredits || 0));
        const fsResetAt = readFsTimestamp(
          fsDoc.fields.lastFreeResetAt,
          teacher.lastFreeResetAt || teacher.createdAt || now
        );
        teacher.credits = fsCredits;
        teacher.usedCredits = fsUsedCredits;
        teacher.lastFreeResetAt = fsResetAt;
      }

      applyDailyFreeCreditReset(teacher, now);

      if (teacher.credits < cost) {
        saveStoredTeachers(teachers);
        return res.status(402).json({
          success: false,
          insufficientCredits: true,
          requiredCredits: cost,
          action: rawAction,
          user: teacher,
          message:
            `Số dư tín dụng AI không đủ hoặc đã hết (thao tác này cần ${cost} tín dụng AI). Hệ thống sẽ tự động làm mới ${DAILY_FREE_CREDITS} tín dụng AI miễn phí sau 24 giờ, hoặc vui lòng liên hệ Quản trị viên qua số điện thoại 0775987267 để tiếp tục sử dụng.`,
        });
      }

      let nextCredits = teacher.credits - cost;
      let nextUsedCredits = Math.max(0, Math.floor(teacher.usedCredits || 0)) + cost;
      let firestoreSynced = false;

      // Sync deduction & cumulative usedCredits to Firestore atomically
      if (verified && firebaseConfig) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const activeFsDoc =
            attempt === 0
              ? fsDoc
              : await syncFirestoreDailyResetIfDue(
                  await fetchFirestoreDoc('users', targetUid, verified.idToken),
                  targetUid,
                  verified.idToken,
                  now
                );

          if (!activeFsDoc?.fields) break;

          const currentFsCredits = Math.max(0, readFsInt(activeFsDoc.fields.credits, 0));
          const currentFsUsed = Math.max(0, readFsInt(activeFsDoc.fields.usedCredits, 0));

          if (currentFsCredits < cost) {
            teacher.credits = currentFsCredits;
            teacher.usedCredits = currentFsUsed;
            teachers[idx] = teacher;
            saveStoredTeachers(teachers);
            return res.status(402).json({
              success: false,
              insufficientCredits: true,
              requiredCredits: cost,
              action: rawAction,
              user: teacher,
              message:
                `Số dư tín dụng AI không đủ hoặc đã hết (thao tác này cần ${cost} tín dụng AI). Hệ thống sẽ tự động làm mới ${DAILY_FREE_CREDITS} tín dụng AI miễn phí sau 24 giờ, hoặc vui lòng liên hệ Quản trị viên qua số điện thoại 0775987267 để tiếp tục sử dụng.`,
            });
          }

          const fsNextCredits = currentFsCredits - cost;
          const fsNextUsed = currentFsUsed + cost;

          const commitResp = await fetch(firestoreCommitUrl(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${verified.idToken}`,
            },
            body: JSON.stringify({
              writes: [
                {
                  update: {
                    name: firestoreDocPath('users', targetUid),
                    fields: {
                      credits: { integerValue: String(fsNextCredits) },
                      usedCredits: { integerValue: String(fsNextUsed) },
                    },
                  },
                  updateMask: { fieldPaths: ['credits', 'usedCredits'] },
                  updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
                  currentDocument: { updateTime: activeFsDoc.updateTime },
                },
              ],
            }),
          }).catch((err) => {
            console.warn('Firestore consume sync warning:', err);
            return null;
          });

          if (commitResp?.ok) {
            firestoreSynced = true;
            nextCredits = fsNextCredits;
            nextUsedCredits = fsNextUsed;
            break;
          }

          const errBody = commitResp ? await commitResp.text().catch(() => '') : 'network_error';
          console.warn(`Firestore consume commit rejected (attempt ${attempt + 1}):`, errBody);
          if (commitResp?.status !== 409 && commitResp?.status !== 412) {
            break;
          }
        }

        if (!firestoreSynced) {
          return res.status(502).json({
            success: false,
            firestoreSynced: false,
            fallbackToClientFirestore: true,
            user: teacher,
            message: 'Đang chuyển sang đồng bộ tín dụng AI trực tiếp với Cloud Firestore.',
          });
        }
      }

      teacher.credits = nextCredits;
      teacher.usedCredits = nextUsedCredits;

      teacher.updatedAt = now;
      teachers[idx] = teacher;
      saveStoredTeachers(teachers);
      broadcastRealtime({ type: 'teachers_updated', teacherId: teacher.id, ts: now });

      res.json({ success: true, firestoreSynced, user: teacher });
    } catch (err: any) {
      console.error('Consume credit error:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi trừ tín dụng AI' });
    }
  });

  // 5. Admin Top-Up Credits directly for a teacher (real-time sync to local & Firestore)
  app.post('/api/credits/topup', async (req, res) => {
    try {
      const adminCheck = await verifyAdminRequest(req);
      if (!adminCheck.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ Quản trị viên mới có quyền cộng tín dụng AI cho giáo viên.',
        });
      }

      const { teacherId, amount } = req.body || {};
      const cleanTeacherId = String(teacherId || '').trim();
      const numericAmount = Number.isFinite(Number(amount)) ? Math.floor(Number(amount)) : 0;

      if (!cleanTeacherId) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin tài khoản giáo viên.' });
      }

      if (numericAmount <= 0 || numericAmount > 100000) {
        return res.status(400).json({
          success: false,
          message: 'Số tín dụng AI cộng thêm phải nằm trong khoảng 1 - 100.000.',
        });
      }

      const now = Date.now();
      const teachers = getStoredTeachers();
      let idx = teachers.findIndex((t) => t.id === cleanTeacherId);
      let prefetchedFsUserDoc: any = null;

      if (idx === -1 && adminCheck.idToken && firebaseConfig) {
        prefetchedFsUserDoc = await fetchFirestoreDoc('users', cleanTeacherId, adminCheck.idToken);
        const mapped = mapFirestoreDocToTeacher(prefetchedFsUserDoc, now);
        if (mapped) {
          teachers.push(mapped);
          idx = teachers.length - 1;
        }
      }

      if (idx === -1) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng.' });
      }

      teachers[idx].credits = (teachers[idx].credits || 0) + numericAmount;
      teachers[idx].updatedAt = now;

      let firestoreSynced = false;

      if (adminCheck.idToken && firebaseConfig) {
        try {
          const fsUserDoc = prefetchedFsUserDoc
            ? prefetchedFsUserDoc
            : await fetchFirestoreDoc('users', cleanTeacherId, adminCheck.idToken);

          if (fsUserDoc?.fields) {
            const fsCredits = Math.max(0, readFsInt(fsUserDoc.fields.credits, 0));
            const fsUsedCredits = Math.max(0, readFsInt(fsUserDoc.fields.usedCredits, 0));
            const nextTotalCredits = fsCredits + numericAmount;
            teachers[idx].credits = nextTotalCredits;
            teachers[idx].usedCredits = fsUsedCredits;

            const commitRes = await fetch(firestoreCommitUrl(), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminCheck.idToken}`,
              },
              body: JSON.stringify({
                writes: [
                  {
                    update: {
                      name: firestoreDocPath('users', cleanTeacherId),
                      fields: {
                        credits: { integerValue: String(nextTotalCredits) },
                      },
                    },
                    updateMask: { fieldPaths: ['credits'] },
                    updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
                  },
                ],
              }),
            });
            if (commitRes.ok) {
              firestoreSynced = true;
            } else {
              console.warn('Firestore admin top-up commit rejected:', await commitRes.text().catch(() => ''));
            }
          }
        } catch (fsErr) {
          console.warn('Firestore admin top-up sync warning:', fsErr);
        }
      }

      saveStoredTeachers(teachers);
      broadcastRealtime({ type: 'teachers_updated', teacherId: cleanTeacherId, ts: now });

      res.json({
        success: true,
        firestoreSynced,
        user: teachers[idx],
        addedCredits: numericAmount,
        message: `Đã cộng +${numericAmount} tín dụng AI cho ${teachers[idx].fullName}.`,
      });
    } catch (err: any) {
      console.error('Top-up error:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cộng tín dụng AI' });
    }
  });

  // 8. Admin delete teacher
  app.delete('/api/teachers/:id', async (req, res) => {
    try {
      const adminCheck = await verifyAdminRequest(req);
      if (!adminCheck.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ Quản trị viên mới có quyền xóa tài khoản.',
        });
      }

      const teacherId = req.params.id;
      let teachers = getStoredTeachers();
      teachers = teachers.filter((t) => t.id !== teacherId);
      saveStoredTeachers(teachers);

      const allAppData = getStoredTeacherAppData();
      if (allAppData[teacherId]) {
        delete allAppData[teacherId];
        saveStoredTeacherAppData(allAppData);
      }

      broadcastRealtime({ type: 'teachers_updated', teacherId, ts: Date.now() });
      res.json({ success: true, message: 'Đã xóa tài khoản khỏi máy chủ' });
    } catch (err: any) {
      console.error('Delete teacher error:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa tài khoản' });
    }
  });

  // 9. Site Branding
  app.get('/api/branding', (req, res) => {
    const branding = getStoredBranding();
    res.json({ success: true, branding });
  });

  app.post('/api/branding', async (req, res) => {
    try {
      const adminCheck = await verifyAdminRequest(req);
      if (!adminCheck.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ Quản trị viên mới có quyền cập nhật hình đại diện hệ thống.',
        });
      }
      const branding = req.body && typeof req.body === 'object' ? req.body : {};
      saveStoredBranding(branding);
      broadcastRealtime({ type: 'branding_updated', branding, ts: Date.now() });
      res.json({ success: true, branding });
    } catch {
      res.status(500).json({ success: false, message: 'Không thể lưu hình đại diện trên máy chủ' });
    }
  });

  // 10. Content Items Endpoints (Không gian ảo 3D, Kho Ứng Dụng, Học Liệu Số, Thí Nghiệm Mô Phỏng)
  const ALLOWED_CONTENT_ZONES = new Set(['virtual_spaces', 'apps', 'games', 'simulations', 'management', 'guides']);
  const VALID_ITEM_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

  app.get('/api/items', (req, res) => {
    try {
      const items = getStoredItems();
      res.json({ success: true, items });
    } catch (err: any) {
      console.error('Error getting items:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải danh sách học liệu' });
    }
  });

  app.post('/api/items', async (req, res) => {
    try {
      const adminCheck = await verifyAdminRequest(req);
      if (!adminCheck.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ Quản trị viên mới có quyền thêm hoặc chỉnh sửa nội dung.',
        });
      }

      const item = req.body;
      if (
        !item ||
        typeof item.id !== 'string' ||
        !VALID_ITEM_ID_REGEX.test(item.id.trim()) ||
        typeof item.title !== 'string' ||
        !item.title.trim() ||
        !ALLOWED_CONTENT_ZONES.has(String(item.zone || ''))
      ) {
        return res.status(400).json({ success: false, message: 'Dữ liệu học liệu không hợp lệ' });
      }

      if (item.creditCost !== undefined) {
        const parsedCost = Number(item.creditCost);
        if (!Number.isFinite(parsedCost) || parsedCost < 0 || parsedCost > MAX_CUSTOM_CREDIT_COST) {
          return res.status(400).json({
            success: false,
            message: 'Giá tín dụng AI của ứng dụng không hợp lệ (0 - 100.000).',
          });
        }
        item.creditCost = Math.floor(parsedCost);
      }

      const items = getStoredItems();
      const existingIdx = items.findIndex((i) => i.id === item.id);
      if (existingIdx >= 0) {
        items[existingIdx] = item;
      } else {
        items.push(item);
      }
      saveStoredItems(items);
      broadcastRealtime({ type: 'items_updated', itemId: item.id, ts: Date.now() });
      res.json({ success: true, item, message: 'Đã lưu thành công trên máy chủ' });
    } catch (err: any) {
      console.error('Error saving item:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lưu học liệu' });
    }
  });

  app.delete('/api/items/:id', async (req, res) => {
    try {
      const adminCheck = await verifyAdminRequest(req);
      if (!adminCheck.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ Quản trị viên mới có quyền xóa nội dung.',
        });
      }

      const { id } = req.params;
      if (!VALID_ITEM_ID_REGEX.test(String(id || ''))) {
        return res.status(400).json({ success: false, message: 'Mã nội dung không hợp lệ' });
      }

      let items = getStoredItems();
      items = items.filter((i) => i.id !== id);
      saveStoredItems(items);
      broadcastRealtime({ type: 'items_updated', itemId: id, ts: Date.now() });
      res.json({ success: true, message: 'Đã xóa nội dung khỏi máy chủ' });
    } catch (err: any) {
      console.error('Error deleting item:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa học liệu' });
    }
  });

  app.post('/api/items/batch', async (req, res) => {
    try {
      const adminCheck = await verifyAdminRequest(req);
      if (!adminCheck.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ Quản trị viên mới có quyền nhập danh sách học liệu.',
        });
      }

      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Danh sách học liệu không hợp lệ' });
      }
      saveStoredItems(items);
      broadcastRealtime({ type: 'items_updated', ts: Date.now() });
      res.json({ success: true, count: items.length, message: 'Đã nhập học liệu thành công trên máy chủ' });
    } catch (err: any) {
      console.error('Error batch saving items:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lưu danh sách học liệu' });
    }
  });

  app.post('/api/items/clear', async (req, res) => {
    try {
      const adminCheck = await verifyAdminRequest(req);
      if (!adminCheck.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ Quản trị viên mới có quyền làm trống danh sách học liệu.',
        });
      }

      saveStoredItems([]);
      broadcastRealtime({ type: 'items_updated', ts: Date.now() });
      res.json({ success: true, message: 'Đã xóa toàn bộ học liệu trên máy chủ' });
    } catch (err: any) {
      console.error('Error clearing items:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi làm trống học liệu' });
    }
  });

  // 11. Per-Teacher Permanent App Data Storage
  app.get('/api/teacher-app-data/:teacherId', (req, res) => {
    try {
      const { teacherId } = req.params;
      const allData = getStoredTeacherAppData();
      res.json({ success: true, data: allData[teacherId] || {} });
    } catch (err: any) {
      console.error('Error reading teacher app data:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải dữ liệu tài khoản' });
    }
  });

  app.get('/api/teacher-app-data/:teacherId/:itemId', (req, res) => {
    try {
      const { teacherId, itemId } = req.params;
      const allData = getStoredTeacherAppData();
      res.json({ success: true, data: (allData[teacherId] && allData[teacherId][itemId]) || {} });
    } catch (err: any) {
      console.error('Error reading item teacher app data:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải dữ liệu ứng dụng' });
    }
  });

  app.post('/api/teacher-app-data/:teacherId/:itemId', (req, res) => {
    try {
      const { teacherId, itemId } = req.params;
      const { op, key, value, data: replaceData, clientId } = req.body || {};

      if (!teacherId || !itemId) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin tài khoản hoặc ứng dụng' });
      }

      const allData = getStoredTeacherAppData();
      if (!allData[teacherId]) {
        allData[teacherId] = {};
      }
      if (!allData[teacherId][itemId]) {
        allData[teacherId][itemId] = {};
      }

      const itemStore = allData[teacherId][itemId];

      if (op === 'set' && typeof key === 'string') {
        itemStore[key] = typeof value === 'string' ? value : String(value ?? '');
      } else if (op === 'remove' && typeof key === 'string') {
        delete itemStore[key];
      } else if (op === 'clear') {
        allData[teacherId][itemId] = {};
      } else if (op === 'replace' && replaceData && typeof replaceData === 'object') {
        allData[teacherId][itemId] = { ...replaceData };
      } else {
        return res.status(400).json({ success: false, message: 'Thao tác cập nhật không hợp lệ' });
      }

      saveStoredTeacherAppData(allData);

      const updatedStore = allData[teacherId][itemId];
      broadcastRealtime({
        type: 'teacher_app_data_updated',
        teacherId,
        itemId,
        data: updatedStore,
        clientId: clientId || null,
        ts: Date.now(),
      });

      res.json({ success: true, data: updatedStore });
    } catch (err: any) {
      console.error('Error saving teacher app data:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lưu dữ liệu ứng dụng' });
    }
  });

  // 12. Server-side Gemini Vietnamese Text-to-Speech (TTS)
  const SUPPORTED_TTS_VOICES = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
  const LEGACY_VOICE_MAP: Record<string, string> = {
    Aoede: 'Kore',
    Leda: 'Zephyr',
  };

  const GEMINI_KEY_ENV_NAMES = [
    'GEMINI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_GEMINI_API_KEY',
    'GEMINI_KEY',
    'GENAI_API_KEY',
    'API_KEY',
    'VITE_GEMINI_API_KEY',
    'NEXT_PUBLIC_GEMINI_API_KEY',
  ] as const;

  const PLACEHOLDER_GEMINI_KEYS = new Set([
    'MY_GEMINI_API_KEY',
    'YOUR_GEMINI_API_KEY',
    'YOUR_API_KEY',
    'GEMINI_API_KEY',
    'REPLACE_ME',
    'UNDEFINED',
    'NULL',
  ]);

  function normalizeEnvSecret(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    let val = raw.trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1).trim();
    }
    if (!val || PLACEHOLDER_GEMINI_KEYS.has(val.toUpperCase())) {
      return '';
    }
    return val;
  }

  function resolveGeminiApiKey(): string {
    for (const name of GEMINI_KEY_ENV_NAMES) {
      const candidate = normalizeEnvSecret(process.env[name]);
      if (candidate) {
        return candidate;
      }
    }
    return '';
  }

  function isTtsBadRequestError(err: any): boolean {
    const status = Number(err?.status ?? err?.cause?.status ?? 0);
    if (status === 400) return true;
    const msg = String(err?.message || '').toUpperCase();
    return msg.includes('400') || msg.includes('INVALID_ARGUMENT');
  }

  function setTtsCorsHeaders(res: express.Response): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store');
  }

  let cachedGeminiClient: GoogleGenAI | null = null;
  let cachedGeminiKey: string | undefined = undefined;

  function getGeminiClient(): GoogleGenAI | null {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      return null;
    }
    if (!cachedGeminiClient || cachedGeminiKey !== apiKey) {
      cachedGeminiKey = apiKey;
      cachedGeminiClient = new GoogleGenAI({
        apiKey,
        apiVersion: 'v1beta',
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
    }
    return cachedGeminiClient;
  }

  app.options('/api/gemini/tts', (_req, res) => {
    setTtsCorsHeaders(res);
    return res.status(204).end();
  });

  app.post('/api/gemini/tts', async (req, res) => {
    setTtsCorsHeaders(res);
    try {
      const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      const rawVoice = typeof req.body?.voiceName === 'string' ? req.body.voiceName.trim() : 'Kore';
      const rawStyle = typeof req.body?.stylePrompt === 'string' ? req.body.stylePrompt.trim() : '';

      if (!rawText) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập nội dung Tiếng Việt để tạo giọng đọc AI.',
        });
      }

      if (rawText.length > 600) {
        return res.status(400).json({
          success: false,
          message: 'Nội dung cần đọc không được vượt quá 600 ký tự.',
        });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(500).json({
          success: false,
          message: 'Máy chủ chưa được cấu hình GEMINI_API_KEY để tạo giọng đọc AI.',
        });
      }

      const mappedVoice = LEGACY_VOICE_MAP[rawVoice] || rawVoice;
      const resolvedVoice = SUPPORTED_TTS_VOICES.has(mappedVoice) ? mappedVoice : 'Kore';
      const styleInstruction =
        rawStyle || 'Đọc bằng giọng Tiếng Việt tự nhiên, phát âm chuẩn, truyền cảm và rõ ràng.';

      const buildPart = (withStyle: boolean) =>
        withStyle
          ? {
              text: rawText,
              speechMetadata: { style: styleInstruction },
            }
          : {
              text: rawText,
            };

      let response: any;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [buildPart(true)],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: resolvedVoice,
                },
              },
            },
          },
        });
      } catch (firstErr: any) {
        // Fallback once without speechMetadata if upstream rejects style metadata
        if (isTtsBadRequestError(firstErr)) {
          response = await ai.models.generateContent({
            model: 'gemini-3.8-flash-lite-tts',
            contents: [
              {
                role: 'user',
                parts: [buildPart(false)],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: resolvedVoice,
                  },
                },
              },
            },
          });
        } else {
          throw firstErr;
        }
      }

      const parts = response?.candidates?.[0]?.content?.parts || [];
      const audioPart = parts.find((p: any) => p?.inlineData?.data);
      const inlineData = audioPart?.inlineData;

      if (!inlineData?.data) {
        return res.status(502).json({
          success: false,
          message: 'Gemini AI không trả về dữ liệu âm thanh. Vui lòng thử lại.',
        });
      }

      return res.json({
        success: true,
        audioBase64: inlineData.data,
        mimeType: inlineData.mimeType || 'audio/wav',
        voiceName: resolvedVoice,
        model: 'gemini-3.8-flash-lite-tts',
      });
    } catch (err: any) {
      console.error('Gemini TTS error:', err);
      const status =
        typeof err?.status === 'number' && err.status >= 400 && err.status < 600
          ? err.status
          : 502;
      const upstreamMsg = err?.message ? String(err.message) : 'Lỗi kết nối Gemini TTS';
      let userMessage = 'Không thể tạo giọng đọc AI Tiếng Việt lúc này. Vui lòng thử lại sau.';
      if (status === 429) {
        userMessage = 'Hệ thống tạo giọng AI đang quá tải tạm thời. Vui lòng đợi vài giây rồi thử lại.';
      } else if (status === 401 || status === 403) {
        userMessage = 'Không thể xác thực dịch vụ tạo giọng đọc AI trên máy chủ.';
      } else if (status === 400) {
        userMessage = 'Yêu cầu tạo giọng đọc không hợp lệ. Vui lòng kiểm tra lại câu Tiếng Việt.';
      }
      return res.status(status).json({
        success: false,
        message: userMessage,
        detail: upstreamMsg,
      });
    }
  });

  // 13. Server-side Southern Vietnamese TTS endpoint (/api/tts) for Từ Ngữ Biết Bay
  interface ServerVoiceConfig {
    prebuiltVoice: 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';
    personaStyle: string;
  }

  const SOUTHERN_VOICE_MAP: Record<string, ServerVoiceConfig> = {
    nu_co_giao: {
      prebuiltVoice: 'Kore',
      personaStyle:
        'Authentic Ho Chi Minh City / Southern Vietnamese female teacher (giọng nữ miền Nam Sài Gòn), warm, gentle, articulate, affectionate classroom tone',
    },
    nu_nang_dong: {
      prebuiltVoice: 'Zephyr',
      personaStyle:
        'Authentic Southern Vietnamese young female teacher (giọng nữ miền Nam trẻ trung), bright, energetic, lively, sparkling classroom enthusiasm',
    },
    nu_mien_tay: {
      prebuiltVoice: 'Kore',
      personaStyle:
        'Authentic Mekong Delta / Southwestern Vietnamese female speaker (giọng nữ miền Tây Nam Bộ), sweet, soft, melodious, warm storytelling rhythm',
    },
    nam_thay_giao: {
      prebuiltVoice: 'Puck',
      personaStyle:
        'Authentic Ho Chi Minh City / Southern Vietnamese male teacher (giọng nam miền Nam Sài Gòn), friendly, cheerful, approachable, upbeat classroom tone',
    },
    nam_tram_am: {
      prebuiltVoice: 'Charon',
      personaStyle:
        'Authentic Southern Vietnamese male teacher (giọng nam miền Nam trầm ấm), calm, deep, clear, reassuring and articulate classroom delivery',
    },
    nam_soi_noi: {
      prebuiltVoice: 'Fenrir',
      personaStyle:
        'Authentic Mekong Delta / Southern Vietnamese lively male game host (giọng nam miền Tây sôi nổi), expressive, playful, warm and energetic',
    },
  };

  app.options('/api/tts', (_req, res) => {
    setTtsCorsHeaders(res);
    return res.status(204).end();
  });

  app.post('/api/tts', async (req, res) => {
    setTtsCorsHeaders(res);
    try {
      const { text, voiceId, gender, tone } = (req.body || {}) as {
        text?: string;
        voiceId?: string;
        gender?: 'female' | 'male';
        tone?: 'correct' | 'wrong' | 'question' | 'sample';
      };

      const cleanText = typeof text === 'string' ? text.trim().slice(0, 360) : '';
      if (!cleanText) {
        return res.status(400).json({ error: 'Vui lòng nhập nội dung cần tạo giọng đọc AI.' });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error:
            'Chưa cấu hình khóa Gemini API trên máy chủ. Vui lòng kiểm tra mục Settings > Secrets.',
        });
      }

      const fallbackId = gender === 'male' ? 'nam_thay_giao' : 'nu_co_giao';
      const voiceCfg =
        (voiceId && SOUTHERN_VOICE_MAP[voiceId]) || SOUTHERN_VOICE_MAP[fallbackId];

      let emotionDesc =
        'bright, joyful, enthusiastic, praising classroom tone celebrating a correct answer';
      if (tone === 'wrong') {
        emotionDesc =
          'gentle, patient, warm, encouraging classroom tone motivating students to try again';
      } else if (tone === 'question') {
        emotionDesc =
          'clear, expressive, steady classroom reading tone so students at the back of the room hear every word distinctly';
      } else if (tone === 'sample') {
        emotionDesc = 'natural, friendly, welcoming classroom introduction tone';
      }

      const styleInstruction = `Speak in natural Southern Vietnamese (tiếng Việt giọng miền Nam Việt Nam). ${voiceCfg.personaStyle}. Deliver with a ${emotionDesc}.`;

      let response: any;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: cleanText,
                  speechMetadata: {
                    style: styleInstruction,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceCfg.prebuiltVoice },
              },
            },
          },
        });
      } catch (firstErr: any) {
        if (isTtsBadRequestError(firstErr)) {
          response = await ai.models.generateContent({
            model: 'gemini-3.8-flash-lite-tts',
            contents: [
              {
                role: 'user',
                parts: [{ text: cleanText }],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceCfg.prebuiltVoice },
                },
              },
            },
          });
        } else {
          throw firstErr;
        }
      }

      const parts = response?.candidates?.[0]?.content?.parts || [];
      const audioPart = parts.find((p: any) => p?.inlineData?.data);
      const inlineData = audioPart?.inlineData;

      if (!inlineData?.data) {
        return res.status(502).json({
          error: 'Không nhận được dữ liệu âm thanh từ mô hình giọng đọc AI.',
        });
      }

      return res.json({
        audioBase64: inlineData.data,
        mimeType: inlineData.mimeType || 'audio/wav',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: unknown }).status)
          : 500;
      console.error('TTS API error:', status, msg);
      if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        return res.status(429).json({
          error:
            'Đã vượt giới hạn gọi giọng đọc AI tạm thời. Vui lòng đợi một chút rồi thử lại.',
        });
      }
      if (status === 403 || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
        return res.status(403).json({
          error:
            'Khóa API không hợp lệ hoặc thiếu quyền. Vui lòng kiểm tra mục Settings > Secrets.',
        });
      }
      return res.status(500).json({
        error: 'Không thể tạo giọng đọc AI lúc này. Vui lòng thử lại.',
      });
    }
  });

  const httpServer = http.createServer(app);

  // --- Vite Dev Server Middleware or Static Production ---
  if (!isProduction) {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const viteReadyPromise = (async () => {
      const { createServer: createViteServer } = await import('vite');
      return createViteServer({
        server: {
          middlewareMode: true,
          allowedHosts: true,
          hmr: disableHmr ? false : { server: httpServer },
          ws: disableHmr ? false : { server: httpServer },
        },
        appType: 'spa',
      });
    })();

    viteReadyPromise.catch((err) => {
      console.error('Failed to initialize Vite dev middleware:', err);
      process.exit(1);
    });

    app.use((req, res, next) => {
      viteReadyPromise
        .then((vite) => vite.middlewares(req, res, next))
        .catch(next);
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.on('error', (err) => {
    console.error(`HTTP server listen error on port ${PORT}:`, err);
    process.exit(1);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT} in ${isProduction ? 'production' : 'development'} mode`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
