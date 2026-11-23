import {
  ContentItem,
  UserAccount,
  UserRole,
  CreditActionType,
  INITIAL_FREE_CREDITS,
  DAILY_FREE_CREDITS,
  DAILY_FREE_RESET_MS,
  CREDIT_COST_STANDARD_ACCESS,
  APP_LAUNCH_CREDIT_COST,
  getItemCreditCost,
} from '../types';
import defaultTeachersRaw from '../data/defaultTeachers.json';
import {
  auth,
  db,
  googleProvider,
  OperationType,
  handleFirestoreError,
} from '../firebase';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  collection,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  DocumentReference,
  Query,
} from 'firebase/firestore';

export const ADMIN_PHONE = '0775987267';

export const ADMIN_CREDENTIALS = {
  email: 'vanloiphuhiep.09@gmail.com',
  phone: ADMIN_PHONE,
};

const ADMIN_PASSWORD_SHA256 =
  '6386b2d89a9a1ac2a4019980a40d429b3fe61a974aea5b1061b93aba6861cd6f';
const ADMIN_SECRET_SESSION_KEY = 'hoclieuso_admin_secret_v1';

async function verifyAdminPasswordHash(password: string): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.crypto?.subtle) return false;
    const encoded = new TextEncoder().encode(password);
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return hex === ADMIN_PASSWORD_SHA256;
  } catch {
    return false;
  }
}

const TEACHERS_STORAGE_KEY = 'hoclieuso_teachers_v1';
const SESSION_STORAGE_KEY = 'hoclieuso_current_user_v1';

function toMillis(val: any, fallback = Date.now()): number {
  if (typeof val === 'number') return val;
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof val.toMillis === 'function') return val.toMillis();
  return fallback;
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

function formatGoogleAuthError(err: any): string {
  const code = err?.code || '';
  const rawMessage = typeof err?.message === 'string' ? err.message : '';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Bạn đã đóng cửa sổ đăng nhập Google.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Trình duyệt đang chặn cửa sổ bật lên. Vui lòng cho phép popup để đăng nhập bằng Google.';
  }
  if (code === 'auth/unauthorized-domain') {
    const currentHost =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : 'tên miền hiện tại';
    return `Tên miền "${currentHost}" chưa được cấp quyền đăng nhập Google trong Firebase Console.\nVui lòng vào Firebase Console (Authentication → Settings → Authorized domains) và thêm "${currentHost}".`;
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Email hoặc mật khẩu không chính xác.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Email này đã được đăng ký. Vui lòng chuyển sang Đăng nhập.';
  }
  if (code === 'auth/weak-password') {
    return 'Mật khẩu quá yếu. Vui lòng nhập mật khẩu từ 6 ký tự trở lên.';
  }
  if (code === 'auth/invalid-email') {
    return 'Địa chỉ email không đúng định dạng.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Đăng nhập bằng Email/Mật khẩu chưa được bật trong Firebase Console (Authentication → Sign-in method → Email/Password).';
  }
  if (code === 'auth/too-many-requests') {
    return 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Lỗi kết nối mạng khi đăng nhập. Vui lòng kiểm tra Internet và thử lại.';
  }
  if (code === 'auth/web-storage-unsupported') {
    return 'Trình duyệt đang tắt cookie hoặc bộ nhớ cục bộ. Vui lòng bật cookie để đăng nhập.';
  }

  // Extract readable error if thrown as JSON FirestoreErrorInfo
  if (rawMessage.startsWith('{') && rawMessage.includes('"error"')) {
    try {
      const parsed = JSON.parse(rawMessage);
      if (parsed?.error) {
        if (String(parsed.error).includes('insufficient permissions')) {
          return 'Không đủ quyền truy cập dữ liệu tài khoản trên Firestore. Vui lòng thử lại hoặc liên hệ Quản trị viên.';
        }
        return `Lỗi đồng bộ tài khoản: ${parsed.error}`;
      }
    } catch {}
  }

  return rawMessage || 'Không thể đăng nhập. Vui lòng thử lại.';
}

function getBundledSeedTeachers(): UserAccount[] {
  if (!Array.isArray(defaultTeachersRaw)) return [];
  return defaultTeachersRaw
    .filter((t: any) => t && t.id && t.email)
    .map((t: any) => ({
      id: String(t.id),
      email: String(t.email).trim().toLowerCase(),
      fullName: String(t.fullName || 'Giáo viên'),
      photoURL: t.photoURL ? String(t.photoURL) : undefined,
      role: 'teacher' as const,
      status: t.status === 'blocked' ? ('blocked' as const) : ('active' as const),
      credits: typeof t.credits === 'number' ? Math.max(0, Math.floor(t.credits)) : INITIAL_FREE_CREDITS,
      usedCredits: typeof t.usedCredits === 'number' ? Math.max(0, Math.floor(t.usedCredits)) : 0,
      lastFreeResetAt: typeof t.lastFreeResetAt === 'number' ? t.lastFreeResetAt : undefined,
      createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
      updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : Date.now(),
    }));
}

class AuthService {
  private cachedTeachers: UserAccount[] = [];
  private accountsSeedingPromise: Promise<void> | null = null;
  private syncingProfilePromises = new Map<
    string,
    Promise<{ success: boolean; message: string; user?: UserAccount }>
  >();

  constructor() {
    this.initFromStorage();
  }

  isFirebaseAdminConnected(): boolean {
    return Boolean(
      auth.currentUser?.emailVerified &&
        auth.currentUser?.email?.toLowerCase() === ADMIN_CREDENTIALS.email.toLowerCase()
    );
  }

  private initFromStorage(): void {
    try {
      const data = localStorage.getItem(TEACHERS_STORAGE_KEY);
      const parsed = data ? JSON.parse(data) : [];
      this.cachedTeachers =
        Array.isArray(parsed) && parsed.length > 0 ? parsed : getBundledSeedTeachers();
    } catch {
      this.cachedTeachers = getBundledSeedTeachers();
    }
  }

  private async getFirebaseHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      await auth.authStateReady?.();
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
    } catch {}
    return headers;
  }

  private async getAdminHeaders(): Promise<Record<string, string>> {
    const headers = await this.getFirebaseHeaders();
    const current = this.getCurrentUser();
    if (current?.role === 'admin') {
      headers['x-admin-email'] = ADMIN_CREDENTIALS.email;
      try {
        const sessionSecret = sessionStorage.getItem(ADMIN_SECRET_SESSION_KEY);
        if (sessionSecret) {
          headers['x-admin-password'] = sessionSecret;
        }
      } catch {}
    }
    return headers;
  }

  async getAdminRequestHeaders(): Promise<Record<string, string>> {
    return this.getAdminHeaders();
  }

  getTotalCredits(user: UserAccount | null): number {
    if (!user) return 0;
    if (user.role === 'admin') return 999999;
    return Math.max(0, Math.floor(user.credits ?? 0));
  }

  getUsedCredits(user: UserAccount | null): number {
    if (!user || user.role === 'admin') return 0;
    return Math.max(0, Math.floor(user.usedCredits ?? 0));
  }

  getNextFreeResetTimestamp(user: UserAccount | null): number | null {
    if (!user || user.role === 'admin') return null;
    const base =
      typeof user.lastFreeResetAt === 'number' && Number.isFinite(user.lastFreeResetAt)
        ? user.lastFreeResetAt
        : user.createdAt;
    if (!base) return null;
    return base + DAILY_FREE_RESET_MS;
  }

  formatTimeUntilFreeReset(user: UserAccount | null): string | null {
    const nextAt = this.getNextFreeResetTimestamp(user);
    if (!nextAt) return null;
    const diff = Math.max(0, nextAt - Date.now());
    if (diff === 0) return 'sắp làm mới';
    const totalMinutes = Math.ceil(diff / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return `${hours} giờ ${minutes > 0 ? `${minutes} phút` : ''}`.trim();
    }
    return `${minutes} phút`;
  }

  async ensureAccountsSeededToFirestore(): Promise<void> {
    try {
      await auth.authStateReady?.();
    } catch {}
    if (
      !auth.currentUser?.emailVerified ||
      auth.currentUser?.email?.toLowerCase() !== ADMIN_CREDENTIALS.email.toLowerCase()
    ) {
      return;
    }
    if (this.accountsSeedingPromise) return this.accountsSeedingPromise;

    this.accountsSeedingPromise = (async () => {
      try {
        const accountsSettingRef = doc(db, 'site_settings', 'accounts');
        const accountsSettingSnap = await getDocPreferServer(accountsSettingRef).catch(() => null);
        const alreadyInitialized = Boolean(
          accountsSettingSnap?.exists() && accountsSettingSnap.data()?.initialized === true
        );

        // Gather seed accounts from Express /api/teachers (if live), static /seed-teachers.json, and bundled defaultTeachersRaw
        let serverTeachers: UserAccount[] = [];
        try {
          const headers = await this.getAdminHeaders();
          const tRes = await fetch('/api/teachers', { headers });
          const tJson = tRes.ok ? await parseJsonSafe(tRes) : null;
          if (tJson?.success && Array.isArray(tJson.teachers)) serverTeachers = tJson.teachers;
        } catch {}

        if (serverTeachers.length === 0) {
          try {
            const sRes = await fetch('/seed-teachers.json', { cache: 'no-store' });
            const sJson = sRes.ok ? await parseJsonSafe(sRes) : null;
            if (Array.isArray(sJson)) serverTeachers = sJson;
          } catch {}
        }

        const candidateTeachersMap = new Map<string, UserAccount>();
        for (const t of getBundledSeedTeachers()) candidateTeachersMap.set(t.id, t);
        for (const t of serverTeachers) candidateTeachersMap.set(t.id, t);

        // Sync candidate teachers into Firestore /users/{uid} ONLY on initial setup so deleted accounts stay deleted
        if (!alreadyInitialized) {
          for (const t of candidateTeachersMap.values()) {
            if (!t.id || t.id === 'admin_root' || t.role !== 'teacher') continue;
            const ref = doc(db, 'users', t.id);
            const snap = await getDocPreferServer(ref).catch(() => null);
            if (!snap?.exists()) {
              const payload: Record<string, any> = {
                uid: t.id,
                email: t.email.trim().slice(0, 200),
                fullName: (t.fullName || 'Giáo viên').slice(0, 150),
                role: 'teacher',
                credits: Math.max(0, Math.floor(t.credits ?? INITIAL_FREE_CREDITS)),
                usedCredits: Math.max(0, Math.floor(t.usedCredits ?? 0)),
                lastFreeResetAt: t.lastFreeResetAt ? Timestamp.fromMillis(t.lastFreeResetAt) : serverTimestamp(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              };
              if (t.photoURL) payload.photoURL = t.photoURL.slice(0, 500);
              await setDoc(ref, payload).catch(() => {});
            } else {
              const existingCredits = Number(snap.data()?.credits ?? 0);
              if (t.credits > existingCredits) {
                const patch: Record<string, any> = {
                  credits: Math.floor(t.credits),
                  updatedAt: serverTimestamp(),
                };
                await updateDoc(ref, patch).catch(() => {});
              }
            }
          }

          await setDoc(accountsSettingRef, {
            initialized: true,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('Auto-seed accounts to Firestore warning:', err);
      } finally {
        this.accountsSeedingPromise = null;
      }
    })();

    return this.accountsSeedingPromise;
  }

  async fetchTeachersFromServer(): Promise<UserAccount[]> {
    try {
      await auth.authStateReady?.();
    } catch {}

    let expressTeachers: UserAccount[] | null = null;
    try {
      const headers = await this.getAdminHeaders();
      const res = await fetch('/api/teachers', { headers });
      const data = await parseJsonSafe(res);
      if (res.ok && data?.success && Array.isArray(data.teachers)) {
        expressTeachers = data.teachers;
      }
    } catch (err) {
      console.warn('Could not fetch teachers from server, using Firestore/seed cache:', err);
    }

    if (this.isFirebaseAdminConnected()) {
      await this.ensureAccountsSeededToFirestore();
      const path = 'users';
      try {
        const snap = await getDocsPreferServer(collection(db, path));
        const fsList = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            email: data.email || '',
            fullName: data.fullName || 'Giáo viên',
            photoURL: data.photoURL,
            role: data.role || 'teacher',
            status: 'active',
            credits: typeof data.credits === 'number' ? Math.max(0, Math.floor(data.credits)) : INITIAL_FREE_CREDITS,
            usedCredits: typeof data.usedCredits === 'number' ? Math.max(0, Math.floor(data.usedCredits)) : 0,
            lastFreeResetAt: toMillis(data.lastFreeResetAt ?? data.createdAt),
            createdAt: toMillis(data.createdAt),
            updatedAt: toMillis(data.updatedAt),
          } as UserAccount;
        });

        const list = [...fsList].sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
        );
        this.cachedTeachers = list;
        try {
          localStorage.setItem(TEACHERS_STORAGE_KEY, JSON.stringify(list));
        } catch {}
        return list;
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    }

    if (expressTeachers && expressTeachers.length > 0) {
      this.cachedTeachers = expressTeachers;
      try {
        localStorage.setItem(TEACHERS_STORAGE_KEY, JSON.stringify(expressTeachers));
      } catch {}
      return expressTeachers;
    }

    const fallback = this.getTeachers();
    return fallback.length > 0 ? fallback : getBundledSeedTeachers();
  }

  subscribeTeachersRealtime(onTeachers: (teachers: UserAccount[]) => void): () => void {
    if (!this.isFirebaseAdminConnected()) {
      return () => {};
    }
    this.ensureAccountsSeededToFirestore().catch(() => {});
    try {
      return onSnapshot(
        collection(db, 'users'),
        (snap) => {
          const fsList = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              email: data.email || '',
              fullName: data.fullName || 'Giáo viên',
              photoURL: data.photoURL,
              role: data.role || 'teacher',
              status: 'active',
              credits: typeof data.credits === 'number' ? Math.max(0, Math.floor(data.credits)) : INITIAL_FREE_CREDITS,
              usedCredits: typeof data.usedCredits === 'number' ? Math.max(0, Math.floor(data.usedCredits)) : 0,
              lastFreeResetAt: toMillis(data.lastFreeResetAt ?? data.createdAt),
              createdAt: toMillis(data.createdAt),
              updatedAt: toMillis(data.updatedAt),
            } as UserAccount;
          });

          const list = [...fsList].sort(
            (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
          );
          this.cachedTeachers = list;
          try {
            localStorage.setItem(TEACHERS_STORAGE_KEY, JSON.stringify(list));
          } catch {}
          onTeachers(list);
        },
        (err) => {
          console.warn('Firestore teachers snapshot warning:', err);
        }
      );
    } catch {
      return () => {};
    }
  }

  subscribeCurrentUserRealtime(uid: string, onUser: (user: UserAccount) => void): () => void {
    if (!uid || !auth.currentUser || auth.currentUser.uid !== uid) {
      return () => {};
    }
    const userRef = doc(db, 'users', uid);
    try {
      return onSnapshot(
        userRef,
        async (snap) => {
          if (!snap.exists()) return;
          const d = snap.data();
          const current = this.getCurrentUser();
          if (current && current.id !== uid) return;

          let credits = typeof d.credits === 'number' ? Math.max(0, Math.floor(d.credits)) : INITIAL_FREE_CREDITS;
          const usedCredits = typeof d.usedCredits === 'number' ? Math.max(0, Math.floor(d.usedCredits)) : 0;
          const createdAt = toMillis(d.createdAt, current?.createdAt || Date.now());
          let lastFreeResetAt = toMillis(d.lastFreeResetAt ?? d.createdAt, createdAt);

          if (
            Date.now() - lastFreeResetAt >= DAILY_FREE_RESET_MS &&
            credits < DAILY_FREE_CREDITS
          ) {
            try {
              await updateDoc(userRef, {
                credits: DAILY_FREE_CREDITS,
                lastFreeResetAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              credits = DAILY_FREE_CREDITS;
              lastFreeResetAt = Date.now();
            } catch {}
          }

          const updated: UserAccount = {
            id: uid,
            email: (d.email || current?.email || '').trim().toLowerCase(),
            fullName: d.fullName || current?.fullName || 'Giáo viên',
            photoURL: d.photoURL || current?.photoURL,
            role: d.role === 'admin' ? 'admin' : 'teacher',
            status: 'active',
            credits,
            usedCredits,
            lastFreeResetAt,
            createdAt,
            updatedAt: toMillis(d.updatedAt, Date.now()),
          };

          this.setCurrentUser(updated);
          onUser(updated);
        },
        (err) => {
          console.warn('Firestore current user snapshot warning:', err);
        }
      );
    } catch {
      return () => {};
    }
  }

  getTeachers(): UserAccount[] {
    try {
      const data = localStorage.getItem(TEACHERS_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return this.cachedTeachers.length > 0 ? this.cachedTeachers : getBundledSeedTeachers();
    } catch {
      return this.cachedTeachers.length > 0 ? this.cachedTeachers : getBundledSeedTeachers();
    }
  }

  saveTeachers(teachers: UserAccount[]): void {
    this.cachedTeachers = teachers;
    localStorage.setItem(TEACHERS_STORAGE_KEY, JSON.stringify(teachers));
  }

  getCurrentUser(): UserAccount | null {
    try {
      const session = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!session) return null;
      const parsed = JSON.parse(session);
      if (parsed && typeof parsed.credits !== 'number') {
        parsed.credits =
          typeof parsed.freeCredits === 'number' || typeof parsed.paidCredits === 'number'
            ? (parsed.freeCredits || 0) + (parsed.paidCredits || 0)
            : INITIAL_FREE_CREDITS;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  setCurrentUser(user: UserAccount | null): void {
    if (user) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  getCurrentRole(): UserRole {
    const user = this.getCurrentUser();
    if (!user) return 'guest';
    if (user.role === 'admin') return 'admin';
    if (user.role === 'teacher' && user.status !== 'blocked') return 'teacher';
    return 'guest';
  }

  async verifyTeacherSessionOnStaticHost(user: UserAccount): Promise<UserAccount | null> {
    if (user.role === 'admin') return user;
    try {
      const headers = await this.getFirebaseHeaders();
      const res = await fetch(`/api/auth/me?uid=${encodeURIComponent(user.id)}`, { headers });
      const data = await parseJsonSafe(res);
      if (data) {
        if (res.ok && data.success && data.user) {
          this.setCurrentUser(data.user);
          return data.user;
        }
        return null;
      }
    } catch {}

    try {
      await auth.authStateReady?.();
    } catch {}
    if (auth.currentUser && auth.currentUser.uid === user.id) {
      return await this.refreshCurrentUser(user);
    }

    // Static host (Vercel) where Firebase Auth is signed out -> clear stale localStorage teacher session
    this.setCurrentUser(null);
    return null;
  }

  async refreshCurrentUser(user: UserAccount): Promise<UserAccount> {
    if (user.role === 'admin') return user;
    try {
      const headers = await this.getFirebaseHeaders();
      const res = await fetch(`/api/auth/me?uid=${encodeURIComponent(user.id)}`, { headers });
      const data = await parseJsonSafe(res);
      if (res.ok && data?.success && data.user) {
        this.setCurrentUser(data.user);
        return data.user;
      }
    } catch {}

    try {
      await auth.authStateReady?.();
    } catch {}

    // Firestore direct fallback (essential for static Vercel hosting without Express server)
    if (auth.currentUser && auth.currentUser.uid === user.id) {
      const userPath = `users/${user.id}`;
      try {
        const userRef = doc(db, 'users', user.id);
        const snap = await getDocPreferServer(userRef);
        if (snap.exists()) {
          const d = snap.data();
          let credits = typeof d.credits === 'number' ? Math.max(0, Math.floor(d.credits)) : INITIAL_FREE_CREDITS;
          const usedCredits =
            typeof d.usedCredits === 'number'
              ? Math.max(0, Math.floor(d.usedCredits))
              : Math.max(0, Math.floor(user.usedCredits ?? 0));
          const createdAt = toMillis(d.createdAt, user.createdAt);
          let lastFreeResetAt = toMillis(d.lastFreeResetAt ?? d.createdAt, createdAt);
          if (
            Date.now() - lastFreeResetAt >= DAILY_FREE_RESET_MS &&
            credits < DAILY_FREE_CREDITS
          ) {
            try {
              await updateDoc(userRef, {
                credits: DAILY_FREE_CREDITS,
                lastFreeResetAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              credits = DAILY_FREE_CREDITS;
              lastFreeResetAt = Date.now();
            } catch {}
          }
          const updated: UserAccount = {
            ...user,
            email: (d.email || user.email).trim().toLowerCase(),
            fullName: d.fullName || user.fullName,
            photoURL: d.photoURL || user.photoURL,
            credits,
            usedCredits,
            lastFreeResetAt,
            createdAt,
            updatedAt: Date.now(),
          };
          this.setCurrentUser(updated);
          return updated;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, userPath);
      }
    }
    return user;
  }

  // Process pending Google signInWithRedirect result (used when popup is blocked on Vercel/mobile)
  async handleGoogleRedirectResult(): Promise<{
    success: boolean;
    message: string;
    user?: UserAccount;
  } | null> {
    try {
      const result = await getRedirectResult(auth);
      if (result?.user) {
        return await this.syncFirebaseUserProfile(result.user);
      }
      return null;
    } catch (err: any) {
      console.error('Google redirect sign-in error:', err);
      return {
        success: false,
        message: formatGoogleAuthError(err),
      };
    }
  }

  // Google Sign-In for Users & Admin (popup primary, automatic redirect fallback on standalone hosts like Vercel)
  async signInWithGoogle(): Promise<{
    success: boolean;
    redirecting?: boolean;
    message: string;
    user?: UserAccount;
  }> {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      return await this.syncFirebaseUserProfile(fbUser);
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      const code = err?.code || '';
      const isTopLevelWindow = typeof window !== 'undefined' && window.self === window.top;

      if (
        isTopLevelWindow &&
        (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment')
      ) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return {
            success: false,
            redirecting: true,
            message: 'Đang chuyển hướng đến trang đăng nhập Google...',
          };
        } catch (redirectErr: any) {
          return {
            success: false,
            message: formatGoogleAuthError(redirectErr),
          };
        }
      }

      return {
        success: false,
        message: formatGoogleAuthError(err),
      };
    }
  }

  // Email & Password Sign-In: strictly for Administrator only
  async signInWithEmailPassword(
    email: string,
    password: string
  ): Promise<{ success: boolean; message: string; user?: UserAccount }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return { success: false, message: 'Vui lòng nhập đầy đủ email và mật khẩu quản trị viên.' };
    }

    if (cleanEmail !== ADMIN_CREDENTIALS.email.toLowerCase()) {
      return {
        success: false,
        message:
          'Đăng nhập bằng Email và mật khẩu chỉ dành riêng cho Quản trị viên. Giáo viên vui lòng chọn tài khoản Google để đăng nhập.',
      };
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      try {
        sessionStorage.setItem(ADMIN_SECRET_SESSION_KEY, password);
      } catch {}
      return await this.syncFirebaseUserProfile(cred.user);
    } catch {
      const adminRes = await this.loginAdmin(password);
      if (adminRes.success) {
        return adminRes;
      }
      return {
        success: false,
        message: 'Email hoặc mật khẩu quản trị viên không chính xác.',
      };
    }
  }

  // Sync Firebase User with Firestore /users/{uid} (20 daily free credits, auto-refreshed after 24h)
  // Deduplicates concurrent calls for the same UID (e.g. signInWithPopup + onAuthStateChanged firing together)
  async syncFirebaseUserProfile(fbUser: FirebaseUser): Promise<{
    success: boolean;
    message: string;
    user?: UserAccount;
  }> {
    const existingSync = this.syncingProfilePromises.get(fbUser.uid);
    if (existingSync) {
      return existingSync;
    }

    const syncPromise = this.performSyncFirebaseUserProfile(fbUser).finally(() => {
      this.syncingProfilePromises.delete(fbUser.uid);
    });
    this.syncingProfilePromises.set(fbUser.uid, syncPromise);
    return syncPromise;
  }

  private async performSyncFirebaseUserProfile(fbUser: FirebaseUser): Promise<{
    success: boolean;
    message: string;
    user?: UserAccount;
  }> {
    const rawEmail = (fbUser.email || '').trim();
    const email = rawEmail.toLowerCase().slice(0, 200);
    const hasProviderDisplayName = Boolean(fbUser.displayName?.trim());
    let fullName = (
      fbUser.displayName?.trim() ||
      email.split('@')[0] ||
      'Giáo viên'
    ).slice(0, 150);
    const photoURL = fbUser.photoURL ? fbUser.photoURL.slice(0, 500) : undefined;

    if (email === ADMIN_CREDENTIALS.email.toLowerCase()) {
      const adminUser: UserAccount = {
        id: 'admin_root',
        email: ADMIN_CREDENTIALS.email,
        fullName: fullName || 'Quản trị viên Hệ thống',
        photoURL,
        role: 'admin',
        status: 'active',
        credits: 999999,
        createdAt: 1700000000000,
      };
      this.setCurrentUser(adminUser);
      this.ensureAccountsSeededToFirestore().catch(() => {});
      return {
        success: true,
        message: 'Đăng nhập Quản trị viên thành công',
        user: adminUser,
      };
    }

    const userDocPath = `users/${fbUser.uid}`;
    const userRef = doc(db, 'users', fbUser.uid);
    let firestoreCredits = INITIAL_FREE_CREDITS;
    let firestoreUsedCredits = 0;
    let firestoreCreatedAt = Date.now();
    let firestoreLastFreeResetAt = firestoreCreatedAt;
    let isNewUser = false;

    try {
      const snap = await getDocPreferServer(userRef);
      if (!snap.exists()) {
        isNewUser = true;
        const payload: Record<string, any> = {
          uid: fbUser.uid,
          email: rawEmail.slice(0, 200),
          fullName,
          role: 'teacher',
          credits: INITIAL_FREE_CREDITS,
          usedCredits: 0,
          lastFreeResetAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (photoURL) payload.photoURL = photoURL;
        try {
          await setDoc(userRef, payload);
        } catch (writeErr) {
          handleFirestoreError(writeErr, OperationType.CREATE, userDocPath);
        }
      } else {
        const data = snap.data();
        if (!hasProviderDisplayName && typeof data.fullName === 'string' && data.fullName.trim()) {
          fullName = data.fullName.trim().slice(0, 150);
        }
        firestoreCredits =
          typeof data.credits === 'number' ? Math.max(0, Math.floor(data.credits)) : INITIAL_FREE_CREDITS;
        firestoreUsedCredits =
          typeof data.usedCredits === 'number' ? Math.max(0, Math.floor(data.usedCredits)) : 0;
        firestoreCreatedAt = toMillis(data.createdAt);
        firestoreLastFreeResetAt = toMillis(data.lastFreeResetAt ?? data.createdAt, firestoreCreatedAt);

        if (
          Date.now() - firestoreLastFreeResetAt >= DAILY_FREE_RESET_MS &&
          firestoreCredits < DAILY_FREE_CREDITS
        ) {
          try {
            await updateDoc(userRef, {
              credits: DAILY_FREE_CREDITS,
              lastFreeResetAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            firestoreCredits = DAILY_FREE_CREDITS;
            firestoreLastFreeResetAt = Date.now();
          } catch (resetErr) {
            console.warn('Firestore 24h daily credit reset warning:', resetErr);
          }
        }

        if (
          (hasProviderDisplayName && data.fullName !== fullName) ||
          (photoURL && data.photoURL !== photoURL)
        ) {
          const profilePatch: Record<string, any> = {
            fullName,
            updatedAt: serverTimestamp(),
          };
          if (photoURL) profilePatch.photoURL = photoURL;
          try {
            await updateDoc(userRef, profilePatch);
          } catch (updErr) {
            console.warn('Profile metadata update warning:', updErr);
          }
        }
      }
    } catch (readErr) {
      handleFirestoreError(readErr, OperationType.GET, userDocPath);
    }

    let finalUser: UserAccount = {
      id: fbUser.uid,
      email,
      fullName,
      photoURL,
      role: 'teacher',
      status: 'active',
      credits: firestoreCredits,
      usedCredits: firestoreUsedCredits,
      lastFreeResetAt: firestoreLastFreeResetAt,
      createdAt: firestoreCreatedAt,
      updatedAt: Date.now(),
    };

    try {
      const headers = await this.getFirebaseHeaders();
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          uid: fbUser.uid,
          email,
          fullName,
          photoURL,
        }),
      });
      const data = await parseJsonSafe(res);
      if (res.ok && data?.success && data.user) {
        finalUser = {
          ...data.user,
          usedCredits:
            typeof data.user.usedCredits === 'number'
              ? Math.max(0, Math.floor(data.user.usedCredits))
              : firestoreUsedCredits,
        };
      }
    } catch (err) {
      console.warn('Server sync warning during sign-in:', err);
    }

    this.setCurrentUser(finalUser);
    return {
      success: true,
      user: finalUser,
      message: isNewUser
        ? `Đăng nhập thành công! Bạn nhận được ${INITIAL_FREE_CREDITS} tín dụng AI miễn phí mỗi ngày (tự động làm mới sau 24 giờ).`
        : 'Đăng nhập thành công!',
    };
  }

  getCreditCostForAction(
    _action: CreditActionType = 'access',
    item?: Pick<ContentItem, 'zone' | 'creditCost'> | null
  ): number {
    if (item) return getItemCreditCost(item);
    return CREDIT_COST_STANDARD_ACCESS;
  }

  // Consume AI credits according to zone & item settings:
  // - Không gian ảo 3D, Kho ứng dụng, Học liệu số, Thí nghiệm mô phỏng: 4 tín dụng AI
  // - Hướng dẫn: 0 tín dụng AI (miễn phí, không trừ)
  // - Ứng dụng Tiện ích: theo giá riêng cài đặt cho từng ứng dụng (creditCost)
  async consumeCreditsForApp(
    user: UserAccount,
    action: CreditActionType = 'access',
    item?: Pick<ContentItem, 'id' | 'zone' | 'creditCost'> | null
  ): Promise<{
    success: boolean;
    insufficientCredits?: boolean;
    requiredCredits?: number;
    user: UserAccount;
    message?: string;
  }> {
    if (user.role === 'admin') {
      return { success: true, user };
    }

    const expectedCost = this.getCreditCostForAction(action, item);
    if (expectedCost <= 0) {
      return { success: true, requiredCredits: 0, user };
    }

    try {
      const headers = await this.getFirebaseHeaders();
      const res = await fetch('/api/credits/consume', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          teacherId: user.id,
          action,
          itemId: item?.id,
          zone: item?.zone,
        }),
      });
      const data = await parseJsonSafe(res);

      if (data) {
        if (res.status === 402 || data.insufficientCredits) {
          if (data.user) this.setCurrentUser(data.user);
          return {
            success: false,
            insufficientCredits: true,
            requiredCredits: data.requiredCredits || expectedCost,
            user: data.user || user,
            message:
              data.message ||
              `Số dư tín dụng AI không đủ hoặc đã hết (cần ${data.requiredCredits || expectedCost} tín dụng AI). Vui lòng liên hệ Quản trị viên qua số điện thoại ${ADMIN_PHONE} để được cấp thêm tín dụng và tiếp tục sử dụng.`,
          };
        }

        const isSignedInClient = Boolean(auth.currentUser && auth.currentUser.uid === user.id);

        if (res.ok && data.success && (data.firestoreSynced === true || !isSignedInClient)) {
          const nextUser = data.user || user;
          this.setCurrentUser(nextUser);
          return { success: true, user: nextUser };
        }

        const shouldFallbackToFirestore =
          isSignedInClient &&
          (data.fallbackToClientFirestore === true ||
            data.firestoreSynced === false ||
            res.status === 404 ||
            res.status >= 500);

        if (!shouldFallbackToFirestore) {
          return {
            success: false,
            user,
            message: data.message || 'Không thể trừ tín dụng AI. Vui lòng thử lại.',
          };
        }
      }
    } catch {}

    try {
      await auth.authStateReady?.();
    } catch {}

    // Direct atomic Firestore transaction (for static Vercel hosting or when backend REST commit fell back)
    if (auth.currentUser && auth.currentUser.uid === user.id) {
      const userPath = `users/${user.id}`;
      const userRef = doc(db, 'users', user.id);
      try {
        const preSnap = await getDocPreferServer(userRef);
        if (!preSnap.exists()) {
          const seedPayload: Record<string, any> = {
            uid: user.id,
            email: (auth.currentUser.email || user.email).slice(0, 200),
            fullName: (auth.currentUser.displayName || user.fullName || 'Giáo viên').slice(0, 150),
            role: 'teacher',
            credits: INITIAL_FREE_CREDITS,
            usedCredits: 0,
            lastFreeResetAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          const photo = auth.currentUser.photoURL || user.photoURL;
          if (photo) seedPayload.photoURL = photo.slice(0, 500);
          await setDoc(userRef, seedPayload);
        }

        const txResult = await runTransaction(db, async (tx) => {
          const snap = await tx.get(userRef);
          if (!snap.exists()) {
            return null;
          }

          const d = snap.data();
          let currentCredits =
            typeof d.credits === 'number' ? Math.max(0, Math.floor(d.credits)) : INITIAL_FREE_CREDITS;
          const prevUsedCredits =
            typeof d.usedCredits === 'number'
              ? Math.max(0, Math.floor(d.usedCredits))
              : Math.max(0, Math.floor(user.usedCredits ?? 0));
          const createdAt = toMillis(d.createdAt, user.createdAt);
          let lastFreeResetAt = toMillis(d.lastFreeResetAt ?? d.createdAt, createdAt);
          let didDailyReset = false;

          if (
            Date.now() - lastFreeResetAt >= DAILY_FREE_RESET_MS &&
            currentCredits < DAILY_FREE_CREDITS
          ) {
            currentCredits = DAILY_FREE_CREDITS;
            lastFreeResetAt = Date.now();
            didDailyReset = true;
          }

          if (currentCredits < expectedCost) {
            if (didDailyReset) {
              tx.update(userRef, {
                credits: DAILY_FREE_CREDITS,
                lastFreeResetAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
            return {
              insufficient: true as const,
              credits: currentCredits,
              usedCredits: prevUsedCredits,
              lastFreeResetAt,
            };
          }

          const nextCredits = currentCredits - expectedCost;
          const nextUsedCredits = prevUsedCredits + expectedCost;
          tx.update(userRef, {
            credits: nextCredits,
            usedCredits: nextUsedCredits,
            ...(didDailyReset ? { lastFreeResetAt: serverTimestamp() } : {}),
            updatedAt: serverTimestamp(),
          });

          return {
            insufficient: false as const,
            credits: nextCredits,
            usedCredits: nextUsedCredits,
            lastFreeResetAt,
          };
        });

        if (txResult) {
          if (txResult.insufficient) {
            const syncedUser: UserAccount = {
              ...user,
              credits: txResult.credits,
              usedCredits: txResult.usedCredits,
              lastFreeResetAt: txResult.lastFreeResetAt,
            };
            this.setCurrentUser(syncedUser);
            return {
              success: false,
              insufficientCredits: true,
              requiredCredits: expectedCost,
              user: syncedUser,
              message: `Số dư tín dụng AI không đủ hoặc đã hết (thao tác này cần ${expectedCost} tín dụng AI). Hệ thống sẽ tự động làm mới ${DAILY_FREE_CREDITS} tín dụng AI miễn phí sau 24 giờ, hoặc vui lòng liên hệ Quản trị viên qua số điện thoại ${ADMIN_PHONE} để tiếp tục sử dụng.`,
            };
          }

          const updatedUser: UserAccount = {
            ...user,
            credits: txResult.credits,
            usedCredits: txResult.usedCredits,
            lastFreeResetAt: txResult.lastFreeResetAt,
            updatedAt: Date.now(),
          };
          this.setCurrentUser(updatedUser);
          return { success: true, user: updatedUser };
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    }

    return {
      success: false,
      user,
      message: 'Lỗi kết nối máy chủ khi kiểm tra tín dụng AI.',
    };
  }

  // Admin directly adds credits to a teacher account (works seamlessly on Express & static Vercel/Firestore)
  async adminTopUpCredits(
    teacherId: string,
    amount: number
  ): Promise<{ success: boolean; message: string; user?: UserAccount }> {
    const addedAmount = Math.max(1, Math.floor(amount || 0));
    try {
      const headers = await this.getAdminHeaders();
      const res = await fetch('/api/credits/topup', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          teacherId,
          amount: addedAmount,
        }),
      });
      const data = await parseJsonSafe(res);
      if (data) {
        if (data.success) {
          if (this.isFirebaseAdminConnected() && !data.firestoreSynced) {
            try {
              const teacherRef = doc(db, 'users', teacherId);
              const snap = await getDoc(teacherRef);
              if (snap.exists()) {
                const currCredits = Number(snap.data().credits || 0);
                await updateDoc(teacherRef, {
                  credits: currCredits + addedAmount,
                  updatedAt: serverTimestamp(),
                });
              }
            } catch (err) {
              console.warn('Firestore admin topup sync warning:', err);
            }
          }

          await this.fetchTeachersFromServer();
          return {
            success: true,
            message: `Đã cộng +${addedAmount} tín dụng AI thành công!`,
            user: data.user,
          };
        }
        // Only return error immediately if it's NOT a 404 (404 happens when teacher registered on Vercel/Firestore only)
        if (res.status !== 404 || !this.isFirebaseAdminConnected()) {
          return { success: false, message: data.message || 'Không thể cộng tín dụng AI.' };
        }
      }
    } catch {}

    try {
      await auth.authStateReady?.();
    } catch {}

    // Direct Firestore update for Admin (static Vercel hosting or Firestore-only teachers)
    if (this.isFirebaseAdminConnected()) {
      const teacherRef = doc(db, 'users', teacherId);
      try {
        const teacherSnap = await getDocPreferServer(teacherRef);
        if (teacherSnap.exists()) {
          const currCredits = Number(teacherSnap.data().credits || 0);
          await updateDoc(teacherRef, {
            credits: currCredits + addedAmount,
            updatedAt: serverTimestamp(),
          });
        } else {
          const cachedTeacher = this.getTeachers().find((t) => t.id === teacherId);
          if (!cachedTeacher) {
            return { success: false, message: 'Không tìm thấy tài khoản giáo viên trên Firestore.' };
          }
          await setDoc(teacherRef, {
            uid: cachedTeacher.id,
            email: cachedTeacher.email.trim().slice(0, 200),
            fullName: (cachedTeacher.fullName || 'Giáo viên').slice(0, 150),
            role: 'teacher',
            credits: Math.max(0, Math.floor((cachedTeacher.credits || 0) + addedAmount)),
            usedCredits: Math.max(0, Math.floor(cachedTeacher.usedCredits ?? 0)),
            lastFreeResetAt: cachedTeacher.lastFreeResetAt
              ? Timestamp.fromMillis(cachedTeacher.lastFreeResetAt)
              : serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            ...(cachedTeacher.photoURL ? { photoURL: cachedTeacher.photoURL.slice(0, 500) } : {}),
          });
        }
        await this.fetchTeachersFromServer();
        return {
          success: true,
          message: `Đã cộng +${addedAmount} tín dụng AI thành công!`,
        };
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${teacherId}`);
      }
    }

    return {
      success: false,
      message: 'Vui lòng đăng nhập bằng tài khoản Google Quản trị để cộng tín dụng trực tuyến.',
    };
  }

  // Admin login check
  async loginAdmin(password: string): Promise<{ success: boolean; message: string; user?: UserAccount }> {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_CREDENTIALS.email, password }),
      });
      const data = await parseJsonSafe(res);
      if (data) {
        if (data.success && data.user) {
          try {
            sessionStorage.setItem(ADMIN_SECRET_SESSION_KEY, password);
          } catch {}
          this.setCurrentUser(data.user);
          return { success: true, message: data.message || 'Đăng nhập Quản trị viên thành công', user: data.user };
        }
        return { success: false, message: data.message || 'Mật khẩu quản trị viên không chính xác' };
      }
    } catch {}

    if (await verifyAdminPasswordHash(password)) {
      const adminUser: UserAccount = {
        id: 'admin_root',
        email: ADMIN_CREDENTIALS.email,
        fullName: 'Quản trị viên Hệ thống',
        role: 'admin',
        status: 'active',
        credits: 999999,
        createdAt: 1700000000000,
      };
      try {
        sessionStorage.setItem(ADMIN_SECRET_SESSION_KEY, password);
      } catch {}
      this.setCurrentUser(adminUser);
      return { success: true, message: 'Đăng nhập Quản trị viên thành công', user: adminUser };
    }
    return { success: false, message: 'Mật khẩu quản trị viên không chính xác' };
  }

  // Admin deletes teacher account
  async adminDeleteTeacher(teacherId: string): Promise<boolean> {
    try {
      const headers = await this.getAdminHeaders();
      await fetch(`/api/teachers/${teacherId}`, { method: 'DELETE', headers });
    } catch (err) {
      console.warn('Server delete failed, deleting locally:', err);
    }

    if (this.isFirebaseAdminConnected()) {
      try {
        await deleteDoc(doc(db, 'users', teacherId));
      } catch (err) {
        console.warn('Firestore teacher delete warning:', err);
      }
    }

    let teachers = this.getTeachers();
    teachers = teachers.filter((t) => t.id !== teacherId);
    this.saveTeachers(teachers);

    const current = this.getCurrentUser();
    if (current && current.id === teacherId) {
      this.setCurrentUser(null);
    }
    return true;
  }

  // Logout
  logout(): void {
    try {
      sessionStorage.removeItem(ADMIN_SECRET_SESSION_KEY);
    } catch {}
    this.setCurrentUser(null);
    signOut(auth).catch(() => {});
  }
}

export const authService = new AuthService();
export { APP_LAUNCH_CREDIT_COST };
