import React, { useState, useEffect, useCallback } from 'react';
import { Home, ChevronRight, Play, Cloud, CloudOff, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { LeftSidebar } from './components/LeftSidebar';
import { ControlDeck } from './components/ControlDeck';
import { ZoneVirtualSpaces } from './components/ZoneVirtualSpaces';
import { ZoneAppsRepository } from './components/ZoneAppsRepository';
import { ZoneInteractiveGames } from './components/ZoneInteractiveGames';
import { ZoneSimulations } from './components/ZoneSimulations';
import { ZoneManagementSoftware } from './components/ZoneManagementSoftware';
import { ZoneGuides } from './components/ZoneGuides';
import { Footer } from './components/Footer';

// Modals
import { AddEditContentModal } from './components/AddEditContentModal';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { AppPlayerModal } from './components/AppPlayerModal';
import { GamePlayerModal } from './components/GamePlayerModal';
import { SimulationPlayerModal } from './components/SimulationPlayerModal';
import { AuthModal } from './components/AuthModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { RedeemCodeModal } from './components/RedeemCodeModal';
import { ContentViewModal } from './components/ContentViewModal';
import { AboutPage } from './components/AboutPage';
import { AuthorPage } from './components/AuthorPage';

// Storage, Auth, Routing & Firebase
import { storageService } from './services/storage';
import { authService, ADMIN_PHONE } from './services/auth';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import edtechBackdrop from './assets/images/edtech_canvas_backdrop_1794922302891.jpg';
import {
  ZONE_ROUTES,
  buildHomePath,
  buildAboutPath,
  buildAuthorPath,
  buildZonePath,
  buildItemPath,
  parsePathname,
  findItemByRouteSegment,
  getZoneFromSectionId,
} from './utils/routing';
import {
  ContentItem,
  UserRole,
  UserAccount,
  ZoneType,
  SiteBranding,
  CreditActionType,
  MIN_CREDIT_COST,
  getItemCreditCost,
  normalizeCreditCost,
} from './types';

export default function App() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [backdropFailed, setBackdropFailed] = useState<boolean>(false);

  // Site branding (avatars for home and zones uploaded by admin)
  const [branding, setBranding] = useState<SiteBranding>(() => storageService.getBranding());

  const handleUpdateBranding = (newBranding: SiteBranding) => {
    storageService.saveBranding(newBranding);
    setBranding(newBranding);
  };

  // Authentication & Role states
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => authService.getCurrentUser());
  const [role, setRole] = useState<UserRole>(() => authService.getCurrentRole());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [adminPanelTab, setAdminPanelTab] = useState<'teachers' | 'pricing' | 'branding'>('teachers');
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(() =>
    storageService.isCloudAdminConnected()
  );
  const [firebaseAuthUid, setFirebaseAuthUid] = useState<string | null>(
    () => auth.currentUser?.uid || null
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() =>
    storageService.getPendingCloudSyncCount()
  );
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [cloudNotice, setCloudNotice] = useState<{
    type: 'success' | 'warning';
    text: string;
  } | null>(null);

  // AI Credits / Contact Admin modal
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [creditModalReason, setCreditModalReason] = useState<string | undefined>(undefined);
  const [requiredCreditsForModal, setRequiredCreditsForModal] = useState<number>(MIN_CREDIT_COST);
  const [pendingLaunch, setPendingLaunch] = useState<{
    type: 'item';
    item: ContentItem;
    action: CreditActionType;
    opener: (item: ContentItem) => void;
  } | null>(null);

  const handleOpenAdminPanel = (
    tab: 'teachers' | 'pricing' | 'branding' = 'teachers'
  ) => {
    setAdminPanelTab(tab);
    setIsAdminPanelOpen(true);
  };

  // Content Selection & Modals
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [targetZone, setTargetZone] = useState<ZoneType>('apps');
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ContentItem | null>(null);

  // Active Viewers / Players
  const [viewingItem, setViewingItem] = useState<ContentItem | null>(null);
  const [runningApp, setRunningApp] = useState<ContentItem | null>(null);
  const [playingGame, setPlayingGame] = useState<ContentItem | null>(null);
  const [runningSimulation, setRunningSimulation] = useState<ContentItem | null>(null);

  // Per-teacher permanent app data & real-time external sync state
  const activeTeacherId = currentUser?.id || (role === 'admin' ? 'admin_root' : null);
  const [teacherAppData, setTeacherAppData] = useState<Record<string, Record<string, string>>>({});
  const [externalSyncEvent, setExternalSyncEvent] = useState<{
    itemId: string;
    data: Record<string, string>;
    ts: number;
  } | null>(null);

  // Layout & UI
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePage, setActivePage] = useState<'home' | 'about' | 'author'>(() => {
    if (typeof window === 'undefined') return 'home';
    const parsedType = parsePathname(window.location.pathname).type;
    if (parsedType === 'about') return 'about';
    if (parsedType === 'author') return 'author';
    return 'home';
  });
  const [activeZoneRoute, setActiveZoneRoute] = useState<ZoneType | null>(() => {
    if (typeof window === 'undefined') return null;
    return parsePathname(window.location.pathname).zone || null;
  });
  const [deepLinkBannerItem, setDeepLinkBannerItem] = useState<ContentItem | null>(null);
  const [activeSection, setActiveSection] = useState<string>(() => {
    if (typeof window === 'undefined') return 'trang-chu';
    const parsed = parsePathname(window.location.pathname);
    if (parsed.type === 'about') return 'gioi-thieu';
    if (parsed.type === 'author') return 've-tac-gia';
    return parsed.zone ? ZONE_ROUTES[parsed.zone].sectionId : 'trang-chu';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const normalizeItems = (storedItems: any[]): ContentItem[] =>
    storedItems
      .map((item: any) => {
        if (item.zone === 'documents') return { ...item, zone: 'simulations', type: 'simulation' };
        if (item.zone === 'images') return { ...item, zone: 'apps', type: 'app' };
        return item;
      })
      .filter((item: any) => item.zone !== 'videos');

  // Load items and branding from permanent server storage on mount
  useEffect(() => {
    async function initStorage() {
      try {
        const [storedItems, serverBranding] = await Promise.all([
          storageService.getAllItems(),
          storageService.fetchBrandingFromServer(),
        ]);
        setItems(normalizeItems(storedItems));

        if (serverBranding && Object.keys(serverBranding).length > 0) {
          setBranding(serverBranding);
        }
      } catch (err) {
        console.error('Failed to load items from server storage:', err);
      } finally {
        setIsLoading(false);
      }
    }
    initStorage();

    const unsubscribeFsItems = storageService.subscribeItemsRealtime((latestItems) => {
      setItems(normalizeItems(latestItems));
      setIsLoading(false);
    });
    const unsubscribeFsBranding = storageService.subscribeBrandingRealtime((latestBranding) => {
      setBranding(latestBranding);
    });

    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      unsubscribeFsItems();
      unsubscribeFsBranding();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  // Track pending Cloud Firestore sync count
  useEffect(() => {
    setPendingSyncCount(storageService.getPendingCloudSyncCount());
    return storageService.subscribeSyncStatus(() => {
      setPendingSyncCount(storageService.getPendingCloudSyncCount());
    });
  }, []);

  // Listen to Firebase Auth state & sync user profile on boot/login (including redirect return on Vercel)
  useEffect(() => {
    authService
      .handleGoogleRedirectResult()
      .then(async (redirectRes) => {
        setIsCloudConnected(authService.isFirebaseAdminConnected());
        if (redirectRes?.success && redirectRes.user) {
          setCurrentUser(redirectRes.user);
          setRole(authService.getCurrentRole());
          if (redirectRes.user.role === 'admin' && authService.isFirebaseAdminConnected()) {
            await storageService.ensureCatalogSeededToFirestore().catch(() => {});
            const [latestItems, latestBranding] = await Promise.all([
              storageService.getAllItems(),
              storageService.fetchBrandingFromServer(),
            ]);
            setItems(normalizeItems(latestItems));
            if (latestBranding && Object.keys(latestBranding).length > 0) {
              setBranding(latestBranding);
            }
          }
        }
      })
      .catch((err) => {
        console.error('Failed to process Google redirect result:', err);
      });

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseAuthUid(fbUser?.uid || null);
      if (fbUser) {
        try {
          const synced = await authService.syncFirebaseUserProfile(fbUser);
          setIsCloudConnected(authService.isFirebaseAdminConnected());
          if (synced.success && synced.user) {
            setCurrentUser(synced.user);
            setRole(authService.getCurrentRole());
            if (synced.user.role === 'admin' && authService.isFirebaseAdminConnected()) {
              await storageService.ensureCatalogSeededToFirestore().catch(() => {});
              const [latestItems, latestBranding] = await Promise.all([
                storageService.getAllItems(),
                storageService.fetchBrandingFromServer(),
              ]);
              setItems(normalizeItems(latestItems));
              if (latestBranding && Object.keys(latestBranding).length > 0) {
                setBranding(latestBranding);
              }
            }
          }
        } catch (err) {
          console.error('Error syncing Google auth session:', err);
        }
      } else {
        setIsCloudConnected(false);
        const existing = authService.getCurrentUser();
        if (existing && existing.role === 'teacher') {
          const verifiedUser = await authService.verifyTeacherSessionOnStaticHost(existing);
          setCurrentUser(verifiedUser);
          setRole(authService.getCurrentRole());
        }
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Real-time Firestore listener for logged-in teacher's credits & usedCredits across all browsers/PCs
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'teacher') return;
    if (!firebaseAuthUid || firebaseAuthUid !== currentUser.id) return;

    const unsubscribeUserFs = authService.subscribeCurrentUserRealtime(
      currentUser.id,
      (liveUser) => {
        setCurrentUser((prev) => {
          if (
            prev &&
            prev.id === liveUser.id &&
            prev.credits === liveUser.credits &&
            (prev.usedCredits ?? 0) === (liveUser.usedCredits ?? 0) &&
            prev.lastFreeResetAt === liveUser.lastFreeResetAt &&
            prev.fullName === liveUser.fullName
          ) {
            return prev;
          }
          return liveUser;
        });
        setRole(authService.getCurrentRole());
      }
    );

    return () => unsubscribeUserFs();
  }, [currentUser?.id, currentUser?.role, firebaseAuthUid]);

  // Automatically check and refresh 20 daily free credits after 24 hours (on timer & tab focus)
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'teacher') return;

    let cancelled = false;
    const checkAndRefreshIfDue = async () => {
      try {
        const nextResetAt = authService.getNextFreeResetTimestamp(currentUser);
        if (nextResetAt && Date.now() >= nextResetAt) {
          const refreshed = await authService.refreshCurrentUser(currentUser);
          if (!cancelled) {
            setCurrentUser(refreshed);
            setRole(authService.getCurrentRole());
          }
        }
      } catch (err) {
        console.error('Failed to refresh daily free credits:', err);
      }
    };

    checkAndRefreshIfDue();

    const nextResetAt = authService.getNextFreeResetTimestamp(currentUser);
    let timerId: number | undefined;
    if (nextResetAt) {
      const remainingMs = Math.max(1000, nextResetAt - Date.now() + 2000);
      if (remainingMs <= 2147483647) {
        timerId = window.setTimeout(checkAndRefreshIfDue, remainingMs);
      }
    }

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkAndRefreshIfDue();
      }
    };

    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    };
  }, [currentUser?.id, currentUser?.role, currentUser?.lastFreeResetAt, currentUser?.credits]);

  // Load & live-sync teacher's saved app data whenever logged-in account or Firebase Auth session changes (works across browsers & PCs on Vercel)
  useEffect(() => {
    let cancelled = false;
    if (!activeTeacherId) {
      setTeacherAppData({});
      return;
    }
    storageService
      .getTeacherAppData(activeTeacherId)
      .then((data) => {
        if (!cancelled) {
          setTeacherAppData(data || {});
        }
      })
      .catch((err) => {
        console.error('Failed to load teacher app data:', err);
      });

    const unsubscribeTeacherFs = storageService.subscribeTeacherAppDataRealtime(
      activeTeacherId,
      (itemId, nextItemData) => {
        if (cancelled) return;
        setTeacherAppData((prev) => ({
          ...prev,
          [itemId]: nextItemData,
        }));
        setExternalSyncEvent({
          itemId,
          data: nextItemData,
          ts: Date.now(),
        });
      }
    );

    return () => {
      cancelled = true;
      unsubscribeTeacherFs();
    };
  }, [activeTeacherId, firebaseAuthUid, isCloudConnected]);

  // Real-time Server-Sent Events subscription for items, branding, teacher credits & app data
  useEffect(() => {
    const unsubscribe = storageService.subscribeRealtime(async (ev) => {
      if (!ev || !ev.type) return;

      if (ev.type === 'items_updated') {
        try {
          const latest = await storageService.getAllItems();
          setItems(normalizeItems(latest));
        } catch {}
      } else if (ev.type === 'branding_updated' && ev.branding) {
        setBranding(ev.branding);
      } else if (
        ev.type === 'teachers_updated' &&
        currentUser &&
        currentUser.role === 'teacher' &&
        (!ev.teacherId || ev.teacherId === currentUser.id)
      ) {
        try {
          const refreshed = await authService.refreshCurrentUser(currentUser);
          setCurrentUser(refreshed);
        } catch (err) {
          console.error('Failed to refresh user from SSE update:', err);
        }
      } else if (
        ev.type === 'teacher_app_data_updated' &&
        activeTeacherId &&
        ev.teacherId === activeTeacherId &&
        ev.clientId !== storageService.clientId
      ) {
        const nextItemData = ev.data || {};
        setTeacherAppData((prev) => ({
          ...prev,
          [ev.itemId]: nextItemData,
        }));
        setExternalSyncEvent({
          itemId: ev.itemId,
          data: nextItemData,
          ts: ev.ts || Date.now(),
        });
      }
    });

    return unsubscribe;
  }, [activeTeacherId, currentUser]);

  const handleTeacherStorageMutation = (
    itemId: string,
    payload: { op: 'set' | 'remove' | 'clear'; key?: string; value?: string }
  ) => {
    if (!activeTeacherId) return;

    setTeacherAppData((prev) => {
      const currentItemMap = { ...(prev[itemId] || {}) };
      if (payload.op === 'set' && typeof payload.key === 'string') {
        currentItemMap[payload.key] = String(payload.value ?? '');
      } else if (payload.op === 'remove' && typeof payload.key === 'string') {
        delete currentItemMap[payload.key];
      } else if (payload.op === 'clear') {
        for (const k of Object.keys(currentItemMap)) delete currentItemMap[k];
      }
      return {
        ...prev,
        [itemId]: currentItemMap,
      };
    });

    storageService.mutateTeacherAppData(activeTeacherId, itemId, payload);
  };

  const pushUrlPath = useCallback((path: string) => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== path) {
      window.history.pushState({ path }, '', path);
    }
    try {
      const canonical = document.getElementById('canonical-link');
      const fullUrl = window.location.origin + path;
      if (canonical) canonical.setAttribute('href', fullUrl);
      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.setAttribute('content', fullUrl);
    } catch {}
  }, []);

  const closeAllContentModals = useCallback(() => {
    setViewingItem(null);
    setRunningApp(null);
    setPlayingGame(null);
    setRunningSimulation(null);
  }, []);

  const navigateToHome = useCallback(() => {
    closeAllContentModals();
    setSelectedItem(null);
    setDeepLinkBannerItem(null);
    setActiveZoneRoute(null);
    setActivePage('home');
    setActiveSection('trang-chu');
    pushUrlPath(buildHomePath());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [closeAllContentModals, pushUrlPath]);

  const navigateToAbout = useCallback(() => {
    closeAllContentModals();
    setSelectedItem(null);
    setDeepLinkBannerItem(null);
    setActiveZoneRoute(null);
    setActivePage('about');
    setActiveSection('gioi-thieu');
    pushUrlPath(buildAboutPath());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [closeAllContentModals, pushUrlPath]);

  const navigateToAuthor = useCallback(() => {
    closeAllContentModals();
    setSelectedItem(null);
    setDeepLinkBannerItem(null);
    setActiveZoneRoute(null);
    setActivePage('author');
    setActiveSection('ve-tac-gia');
    pushUrlPath(buildAuthorPath());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [closeAllContentModals, pushUrlPath]);

  const navigateToZone = useCallback(
    (zone: ZoneType) => {
      closeAllContentModals();
      setSelectedItem(null);
      setDeepLinkBannerItem(null);
      setActivePage('home');
      setActiveZoneRoute(zone);
      const meta = ZONE_ROUTES[zone];
      setActiveSection(meta.sectionId);
      pushUrlPath(buildZonePath(zone));
      setTimeout(() => {
        const el = document.getElementById(meta.sectionId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 60);
    },
    [closeAllContentModals, pushUrlPath]
  );

  // Sync deep-linked route after items load & handle browser Back/Forward (popstate)
  useEffect(() => {
    if (isLoading) return;

    const syncFromCurrentPath = (isInitialLoad: boolean) => {
      const parsed = parsePathname(window.location.pathname);
      if (parsed.type === 'about') {
        closeAllContentModals();
        setSelectedItem(null);
        setDeepLinkBannerItem(null);
        setActiveZoneRoute(null);
        setActivePage('about');
        setActiveSection('gioi-thieu');
        return;
      }

      if (parsed.type === 'author') {
        closeAllContentModals();
        setSelectedItem(null);
        setDeepLinkBannerItem(null);
        setActiveZoneRoute(null);
        setActivePage('author');
        setActiveSection('ve-tac-gia');
        return;
      }

      setActivePage('home');
      if (parsed.type === 'home') {
        closeAllContentModals();
        setSelectedItem(null);
        setDeepLinkBannerItem(null);
        setActiveZoneRoute(null);
        setActiveSection('trang-chu');
        return;
      }

      if (parsed.zone) {
        setActiveZoneRoute(parsed.zone);
        setActiveSection(ZONE_ROUTES[parsed.zone].sectionId);
        if (isInitialLoad && parsed.type === 'zone') {
          setTimeout(() => {
            const el = document.getElementById(ZONE_ROUTES[parsed.zone!].sectionId);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }, 120);
        }
      }

      if (parsed.type === 'item' && parsed.itemSlugOrId) {
        const matched = findItemByRouteSegment(items, parsed.itemSlugOrId, parsed.zone);
        if (matched) {
          setActiveZoneRoute(matched.zone);
          setActiveSection(ZONE_ROUTES[matched.zone].sectionId);
          setSelectedItem(matched);
          setDeepLinkBannerItem(matched);
          if (isInitialLoad) {
            setTimeout(() => {
              const el = document.getElementById(ZONE_ROUTES[matched.zone].sectionId);
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 120);
          }
        }
      } else {
        closeAllContentModals();
        setSelectedItem(null);
        setDeepLinkBannerItem(null);
      }
    };

    syncFromCurrentPath(true);

    const onPopState = () => {
      syncFromCurrentPath(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isLoading, items, closeAllContentModals]);

  // Track active section for navigation
  useEffect(() => {
    const handleScroll = () => {
      if (activePage === 'about') {
        setActiveSection('gioi-thieu');
        return;
      }
      if (activePage === 'author') {
        setActiveSection('ve-tac-gia');
        return;
      }
      if (window.scrollY < 100) {
        setActiveSection('trang-chu');
        return;
      }

      const sections = [
        'khong-gian-ao-3d',
        'kho-ung-dung',
        'tro-choi-tuong-tac',
        'thi-nghiem-mo-phong',
        'ung-dung-tien-ich',
        'huong-dan',
      ];
      const scrollPosition = window.scrollY + 200;

      for (const sectionId of sections) {
        const element = document.getElementById(sectionId);
        if (element) {
          const top = element.offsetTop;
          const height = element.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activePage]);

  // Auth Handlers
  const handleOpenAuth = () => {
    setIsAuthModalOpen(true);
  };

  const showCloudNotice = useCallback((type: 'success' | 'warning', text: string) => {
    setCloudNotice({ type, text });
    window.setTimeout(() => {
      setCloudNotice((curr) => (curr?.text === text ? null : curr));
    }, 6500);
  }, []);

  const getReadableError = (err: unknown, fallback: string): string => {
    if (err instanceof Error && err.message) {
      if (err.message.includes('insufficient permissions')) {
        return 'Không đủ quyền truy cập Cloud Firestore. Vui lòng đăng nhập lại và thử lại.';
      }
      if (!err.message.trim().startsWith('{')) {
        return err.message;
      }
    }
    return fallback;
  };

  const handleAuthSuccess = async (user: UserAccount | null) => {
    if (user) {
      authService.setCurrentUser(user);
    }
    setCurrentUser(user);
    setIsCloudConnected(authService.isFirebaseAdminConnected());
    setRole(
      user
        ? user.role === 'admin'
          ? 'admin'
          : user.status !== 'blocked'
          ? 'teacher'
          : 'guest'
        : authService.getCurrentRole()
    );
    if (user?.role === 'admin' && authService.isFirebaseAdminConnected()) {
      try {
        await storageService.ensureCatalogSeededToFirestore().catch(() => {});
        const latest = await storageService.getAllItems();
        setItems(normalizeItems(latest));
      } catch (err) {
        console.error('Failed to sync catalog after admin sign-in:', err);
      }
    }
    if (user && pendingLaunch) {
      const nextLaunch = pendingLaunch;
      setPendingLaunch(null);
      await handleLaunchContentWithCredits(
        nextLaunch.item,
        nextLaunch.action,
        nextLaunch.opener,
        user
      );
    }
  };

  const handleConnectCloudAdmin = async () => {
    setIsSyncingCloud(true);
    try {
      const res = await authService.signInWithGoogle();
      const connected = authService.isFirebaseAdminConnected();
      setIsCloudConnected(connected);
      if (res.success && connected) {
        if (res.user) {
          setCurrentUser(res.user);
          setRole(authService.getCurrentRole());
        }
        const flushRes = await storageService.syncPendingToFirestore();
        await storageService.ensureCatalogSeededToFirestore().catch(() => {});
        const [latestItems, latestBranding] = await Promise.all([
          storageService.getAllItems(),
          storageService.fetchBrandingFromServer(),
        ]);
        setItems(normalizeItems(latestItems));
        if (latestBranding && Object.keys(latestBranding).length > 0) {
          setBranding(latestBranding);
        }
        const totalSynced = flushRes.syncedUpserts + flushRes.syncedDeletes + (flushRes.syncedBranding ? 1 : 0);
        showCloudNotice(
          'success',
          totalSynced > 0
            ? `Đã kết nối Đám mây và đồng bộ vĩnh viễn ${totalSynced} thay đổi cho mọi máy tính & trình duyệt.`
            : 'Đã kết nối Đám mây Quản trị — mọi dữ liệu và mã nhúng từ nay được lưu vĩnh viễn trên Cloud Firestore.'
        );
      } else if (res.success && !connected) {
        showCloudNotice(
          'warning',
          'Vui lòng chọn đúng tài khoản Google Quản trị (vanloiphuhiep.09@gmail.com) để đồng bộ dữ liệu hệ thống.'
        );
      } else if (res.message) {
        showCloudNotice('warning', res.message);
      }
    } catch (err) {
      console.error('Cloud admin connect error:', err);
      showCloudNotice(
        'warning',
        getReadableError(err, 'Không thể kết nối Google Đám mây lúc này. Vui lòng thử lại.')
      );
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleSyncPendingNow = async () => {
    setIsSyncingCloud(true);
    try {
      const flushRes = await storageService.syncPendingToFirestore();
      const latestItems = await storageService.getAllItems();
      setItems(normalizeItems(latestItems));
      if (flushRes.failedCount === 0) {
        showCloudNotice(
          'success',
          'Đã đồng bộ toàn bộ dữ liệu và mã nhúng lên Cloud Firestore vĩnh viễn.'
        );
      } else {
        showCloudNotice(
          'warning',
          `Vẫn còn ${flushRes.failedCount} thay đổi chưa đồng bộ được. Vui lòng kiểm tra kết nối mạng và thử lại.`
        );
      }
    } catch (err) {
      console.error('Sync pending error:', err);
      showCloudNotice(
        'warning',
        getReadableError(err, 'Không thể đồng bộ lên Đám mây lúc này. Vui lòng thử lại.')
      );
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setRole('guest');
    setIsCloudConnected(false);
    setPendingLaunch(null);
  };

  const isAdmin = role === 'admin';

  // Launch content with zone-based AI credit deduction:
  // - Không gian ảo 3D, Kho Ứng Dụng, Học Liệu Số, Thí Nghiệm Mô Phỏng: 4 tín dụng AI
  // - Hướng dẫn: 0 tín dụng AI (miễn phí, không trừ)
  // - Ứng dụng Tiện ích: theo giá riêng cài đặt cho từng ứng dụng (creditCost)
  const handleLaunchContentWithCredits = async (
    item: ContentItem,
    action: CreditActionType,
    onAuthorizedOpen: (item: ContentItem) => void,
    overrideUser?: UserAccount
  ) => {
    setSelectedItem(item);

    // Truy cập mục Hướng dẫn luôn miễn phí, không yêu cầu trừ tín dụng AI
    if (item.zone === 'guides') {
      setPendingLaunch(null);
      setDeepLinkBannerItem(null);
      setActiveZoneRoute('guides');
      setActiveSection(ZONE_ROUTES.guides.sectionId);
      pushUrlPath(buildItemPath(item));
      onAuthorizedOpen(item);
      return;
    }

    const activeUser = overrideUser || currentUser;
    const isActiveTeacherOrAdmin =
      role === 'admin' ||
      activeUser?.role === 'admin' ||
      (Boolean(activeUser) && activeUser?.status !== 'blocked');

    if (!isActiveTeacherOrAdmin || !activeUser) {
      setPendingLaunch({ type: 'item', item, action, opener: onAuthorizedOpen });
      handleOpenAuth();
      return;
    }

    if (role === 'admin' || activeUser.role === 'admin') {
      setPendingLaunch(null);
      setDeepLinkBannerItem(null);
      setActiveZoneRoute(item.zone);
      setActiveSection(ZONE_ROUTES[item.zone].sectionId);
      pushUrlPath(buildItemPath(item));
      onAuthorizedOpen(item);
      return;
    }

    try {
      const res = await authService.consumeCreditsForApp(activeUser, action, item);
      setCurrentUser(res.user);
      setRole(authService.getCurrentRole());

      const needed =
        typeof res.requiredCredits === 'number'
          ? res.requiredCredits
          : authService.getCreditCostForAction(action, item);
      const remainingCredits = authService.getTotalCredits(res.user);

      if (needed > 0 && (res.insufficientCredits || (!res.success && remainingCredits < needed))) {
        setPendingLaunch({ type: 'item', item, action, opener: onAuthorizedOpen });
        setRequiredCreditsForModal(needed);
        setCreditModalReason(
          res.message ||
            `Số dư tín dụng AI không đủ hoặc đã hết (cần ${needed} tín dụng AI). Vui lòng liên hệ Quản trị viên qua số điện thoại ${ADMIN_PHONE} để tiếp tục sử dụng.`
        );
        setIsCreditModalOpen(true);
        return;
      }

      if (!res.success) {
        showCloudNotice('warning', res.message || 'Không thể kiểm tra tín dụng AI. Vui lòng thử lại.');
        return;
      }

      setPendingLaunch(null);
      setDeepLinkBannerItem(null);
      setActiveZoneRoute(item.zone);
      setActiveSection(ZONE_ROUTES[item.zone].sectionId);
      pushUrlPath(buildItemPath(item));
      onAuthorizedOpen(item);
    } catch (err) {
      console.error('Failed to consume AI credits when launching content:', err);
      showCloudNotice(
        'warning',
        getReadableError(err, 'Không thể kiểm tra hoặc trừ tín dụng AI lúc này. Vui lòng thử lại.')
      );
    }
  };

  // Content Handlers: Chỉ Quản trị viên có quyền thêm/sửa/xóa nội dung
  const handleOpenEditModal = (item: ContentItem) => {
    if (!isAdmin) return;
    setTargetZone(item.zone);
    setEditingItem(item);
    setIsAddEditModalOpen(true);
  };

  const handlePromptDelete = (item: ContentItem) => {
    if (!isAdmin) return;
    setItemToDelete(item);
  };

  const handleConfirmDelete = async () => {
    if (!isAdmin || !itemToDelete) return;
    try {
      const res = await storageService.deleteItem(itemToDelete.id);
      setItems((prev) => prev.filter((i) => i.id !== itemToDelete.id));
      if (selectedItem?.id === itemToDelete.id) {
        setSelectedItem(null);
      }
      setItemToDelete(null);
      if (res.firestoreSynced) {
        showCloudNotice('success', 'Đã xóa vĩnh viễn nội dung trên Hệ thống Đám mây.');
      } else {
        showCloudNotice(
          'warning',
          'Đã xóa nội dung trên máy này. Hãy nhấn "Kết nối Google Đám mây" để cập nhật xóa trên mọi máy tính & trình duyệt khác.'
        );
      }
    } catch (err) {
      console.error('Lỗi khi xóa nội dung:', err);
      showCloudNotice('warning', 'Không thể xóa nội dung trên Cloud Firestore. Vui lòng thử lại.');
    }
  };

  const handleSaveItem = async (data: Partial<ContentItem>) => {
    if (!isAdmin) return;

    const now = Date.now();
    let savedItem: ContentItem;

    if (editingItem) {
      const nextZone = data.zone || editingItem.zone;
      savedItem = {
        ...editingItem,
        ...data,
        updatedAt: now,
      } as ContentItem;
      if (nextZone === 'management') {
        savedItem.creditCost =
          normalizeCreditCost(data.creditCost) ?? getItemCreditCost(editingItem);
      } else {
        delete savedItem.creditCost;
      }
    } else {
      throw new Error('Chức năng thêm mới nội dung hiện đang được tắt.');
    }

    const res = await storageService.saveItem(savedItem);

    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === savedItem.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = savedItem;
        return next;
      }
      return [...prev, savedItem];
    });

    setSelectedItem(savedItem);

    if (res.firestoreSynced) {
      showCloudNotice(
        'success',
        `Đã lưu vĩnh viễn "${savedItem.title}" và mã nhúng lên Hệ thống Đám mây — mọi máy tính & trình duyệt đều xem được.`
      );
    } else if (res.needsGoogleCloudAuth) {
      showCloudNotice(
        'warning',
        `Đã lưu tạm "${savedItem.title}" trên máy này. Vui lòng nhấn "Kết nối Google Đám mây" để lưu vĩnh viễn cho mọi máy tính & trình duyệt khác.`
      );
    }
  };

  const handleUpdateManagementItemPrice = async (item: ContentItem, nextCost: number) => {
    if (!isAdmin) return;
    const sanitizedCost = normalizeCreditCost(nextCost) ?? 0;
    const updatedItem: ContentItem = {
      ...item,
      creditCost: sanitizedCost,
      updatedAt: Date.now(),
    };
    const res = await storageService.saveItem(updatedItem);
    setItems((prev) => prev.map((i) => (i.id === updatedItem.id ? updatedItem : i)));
    if (selectedItem?.id === updatedItem.id) {
      setSelectedItem(updatedItem);
    }
    if (res.firestoreSynced) {
      showCloudNotice(
        'success',
        `Đã cập nhật giá "${updatedItem.title}": ${
          sanitizedCost === 0 ? 'Miễn phí' : `${sanitizedCost} tín dụng AI`
        } trên Cloud Firestore.`
      );
    } else if (res.needsGoogleCloudAuth) {
      showCloudNotice(
        'warning',
        `Đã lưu tạm giá mới cho "${updatedItem.title}". Hãy kết nối Google Đám mây để đồng bộ đa thiết bị.`
      );
    }
  };

  // Fullscreen & Reset View
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleResetView = () => {
    navigateToHome();
  };

  // Export / Import
  const handleExport = async () => {
    try {
      const jsonStr = await storageService.exportData();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hoc-lieu-so-giao-vien-sang-tao-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      showCloudNotice('warning', 'Không thể xuất dữ liệu học liệu.');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const result = await storageService.importData(content);
        setItems(result.items);
        if (result.branding) {
          setBranding(result.branding);
        }
        showCloudNotice('success', `Đã nhập thành công ${result.items.length} mục nội dung!`);
      } catch (err: any) {
        showCloudNotice('warning', getReadableError(err, 'Lỗi khi nhập tệp học liệu.'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Filter items
  const virtualSpaceItems = items.filter((i) => i.zone === 'virtual_spaces');
  const appItems = items.filter((i) => i.zone === 'apps');
  const gameItems = items.filter((i) => i.zone === 'games');
  const simItems = items.filter((i) => i.zone === 'simulations');
  const managementItems = items.filter((i) => i.zone === 'management');
  const guideItems = items.filter((i) => i.zone === 'guides');

  return (
    <div className="relative min-h-screen flex flex-col edtech-canvas-fallback text-slate-800 pb-16 md:pl-72">
      {/* Atmospheric Educational Canvas Backdrop */}
      <div
        className="fixed inset-0 md:left-72 z-0 pointer-events-none select-none overflow-hidden"
        aria-hidden="true"
      >
        {!backdropFailed && (
          <img
            src={edtechBackdrop}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setBackdropFailed(true)}
            className="w-full h-full object-cover object-center scale-[1.01] opacity-80"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-sky-50/48 to-white/75 backdrop-blur-[1px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.8),transparent_58%),radial-gradient(ellipse_at_bottom_right,rgba(240,253,250,0.75),transparent_62%)]" />
      </div>

      {/* Fixed Left Navigation Bar */}
      <LeftSidebar
        role={role}
        currentUser={currentUser}
        branding={branding}
        onOpenAuth={handleOpenAuth}
        onOpenAdminPanel={() => handleOpenAdminPanel('teachers')}
        onOpenContactAdmin={() => {
          setPendingLaunch(null);
          setRequiredCreditsForModal(MIN_CREDIT_COST);
          setCreditModalReason(undefined);
          setIsCreditModalOpen(true);
        }}
        onLogout={handleLogout}
        activeSection={activeSection}
        onNavigate={(sectionId) => {
          if (sectionId === 'trang-chu') {
            navigateToHome();
            return;
          }
          if (sectionId === 'gioi-thieu') {
            navigateToAbout();
            return;
          }
          if (sectionId === 've-tac-gia') {
            navigateToAuthor();
            return;
          }
          const zone = getZoneFromSectionId(sectionId);
          if (zone) {
            navigateToZone(zone);
            return;
          }
          setActivePage('home');
          setTimeout(() => {
            const el = document.getElementById(sectionId);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }, 60);
        }}
        onResetView={handleResetView}
        onExport={handleExport}
        onImport={handleImport}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        counts={{
          virtualSpaces: virtualSpaceItems.length,
          apps: appItems.length,
          games: gameItems.length,
          sims: simItems.length,
          management: managementItems.length,
          guides: guideItems.length,
        }}
      />

      {/* Fixed Sticky Top Bar (Soft Pastel Green Title Strip + Workspace Control Deck + Breadcrumb Bar) */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-sky-200/80 shadow-xs">
        <div className="bg-gradient-to-r from-emerald-100/85 via-green-50/95 to-teal-100/80 border-b border-emerald-200/80 px-4 py-2 text-center">
          <h1 className="text-sm sm:text-base md:text-lg font-bold font-display tracking-wide text-emerald-950 leading-tight">
            Học liệu số Giáo viên sáng tạo
          </h1>
          <p className="text-xs sm:text-sm md:text-[15px] font-medium text-emerald-800 mt-0.5 tracking-normal">
            Kết nối tri thức – Lan tỏa sáng tạo – Đổi mới giáo dục
          </p>
        </div>
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-2.5">
          <ControlDeck
            role={role}
            currentUser={currentUser}
            isAboutPage={activePage === 'about'}
            isCloudConnected={isCloudConnected}
            pendingSyncCount={pendingSyncCount}
            isSyncingCloud={isSyncingCloud}
            onConnectCloud={handleConnectCloudAdmin}
            onSyncPendingNow={handleSyncPendingNow}
            onOpenAbout={navigateToAbout}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
            onOpenAuth={handleOpenAuth}
            onOpenAdminPanel={() => handleOpenAdminPanel('teachers')}
            onOpenAdminPanelTab={handleOpenAdminPanel}
            onOpenContactAdmin={() => {
              setPendingLaunch(null);
              setRequiredCreditsForModal(MIN_CREDIT_COST);
              setCreditModalReason(undefined);
              setIsCreditModalOpen(true);
            }}
            onLogout={handleLogout}
            selectedItem={selectedItem}
            onEditSelected={() => selectedItem && handleOpenEditModal(selectedItem)}
            onDeleteSelected={() => selectedItem && handlePromptDelete(selectedItem)}
            onResetView={handleResetView}
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
          />
        </div>

        {/* Breadcrumb Path Bar: Trang chủ > Trang con > Nội dung trên link */}
        {(() => {
          const isSubPage = activePage === 'about' || activePage === 'author';
          const isAbout = activePage === 'about';
          const isAuthor = activePage === 'author';
          const activeContentItem = isSubPage
            ? null
            : runningApp || playingGame || runningSimulation || viewingItem || selectedItem;
          const resolvedZone = isSubPage
            ? null
            : activeContentItem?.zone ||
              activeZoneRoute ||
              getZoneFromSectionId(activeSection);
          const resolvedZoneMeta = resolvedZone ? ZONE_ROUTES[resolvedZone] : null;
          const currentLinkPath = isAbout
            ? buildAboutPath()
            : isAuthor
            ? buildAuthorPath()
            : activeContentItem
            ? buildItemPath(activeContentItem)
            : resolvedZone
            ? buildZonePath(resolvedZone)
            : buildHomePath();

          return (
            <div className="border-t border-sky-100/80 bg-sky-50/70">
              <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <nav
                  aria-label="Đường dẫn trang"
                  className="flex items-center gap-1.5 flex-wrap text-slate-600"
                >
                  <button
                    type="button"
                    onClick={navigateToHome}
                    className={`inline-flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                      !isSubPage && !resolvedZoneMeta && !activeContentItem
                        ? 'text-sky-800'
                        : 'text-slate-600 hover:text-sky-700'
                    }`}
                  >
                    <Home className="w-3.5 h-3.5 text-sky-600" />
                    <span>Trang chủ</span>
                  </button>

                  {isAbout && (
                    <>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-bold text-emerald-800">Giới thiệu</span>
                    </>
                  )}

                  {isAuthor && (
                    <>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-bold text-sky-900">Về Tác giả</span>
                    </>
                  )}

                  {!isSubPage && resolvedZoneMeta && (
                    <>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <button
                        type="button"
                        onClick={() => navigateToZone(resolvedZoneMeta.zone)}
                        className={`font-semibold transition-colors cursor-pointer ${
                          !activeContentItem
                            ? 'text-sky-800'
                            : 'text-slate-600 hover:text-sky-700'
                        }`}
                      >
                        {resolvedZoneMeta.label}
                      </button>
                    </>
                  )}

                  {!isSubPage && activeContentItem && (
                    <>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-bold text-sky-900 truncate max-w-[260px] sm:max-w-sm">
                        {activeContentItem.title}
                      </span>
                    </>
                  )}
                </nav>

                <div className="flex items-center gap-2 flex-wrap">
                  {!isSubPage &&
                    deepLinkBannerItem &&
                    !runningApp &&
                    !playingGame &&
                    !runningSimulation &&
                    !viewingItem && (
                      <button
                        type="button"
                        onClick={() => {
                          const item = deepLinkBannerItem;
                          if (item.zone === 'guides') {
                            setSelectedItem(item);
                            setDeepLinkBannerItem(null);
                            setRunningApp(item);
                          } else if (item.zone === 'games') {
                            handleLaunchContentWithCredits(item, 'access', setPlayingGame);
                          } else if (item.zone === 'simulations') {
                            handleLaunchContentWithCredits(item, 'access', setRunningSimulation);
                          } else {
                            handleLaunchContentWithCredits(item, 'access', setRunningApp);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Mở nội dung</span>
                      </button>
                    )}

                  <span
                    className="hidden sm:inline font-mono text-[11px] text-slate-500 bg-white/80 px-2 py-0.5 rounded-md border border-sky-100 truncate max-w-[260px]"
                    title={currentLinkPath}
                  >
                    {currentLinkPath}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-8">
        {isAdmin && (!isCloudConnected || pendingSyncCount > 0) && (
          <div className="p-4 rounded-2xl bg-amber-50/95 backdrop-blur-xs border border-amber-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-950 leading-relaxed">
              <CloudOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900">
                  {!isCloudConnected
                    ? 'Chưa kết nối tài khoản Google Đám mây để đồng bộ vĩnh viễn đa máy tính'
                    : `Có ${pendingSyncCount} thay đổi dữ liệu/mã nhúng đang chờ đồng bộ lên Đám mây`}
                </p>
                <p className="text-amber-800 mt-0.5">
                  {!isCloudConnected
                    ? 'Để mọi nội dung và mã nhúng thêm vào Kho ứng dụng, Học liệu số, Thí nghiệm mô phỏng được lưu trữ vĩnh viễn và mở được trên mọi máy tính, mọi trình duyệt, vui lòng kết nối Google Quản trị (vanloiphuhiep.09@gmail.com).'
                    : 'Nhấn "Đồng bộ lên Đám mây ngay" để đảm bảo toàn bộ dữ liệu xuất hiện đồng nhất trên mọi máy tính và trình duyệt.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={!isCloudConnected ? handleConnectCloudAdmin : handleSyncPendingNow}
              disabled={isSyncingCloud}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-60"
            >
              {isSyncingCloud ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cloud className="w-3.5 h-3.5" />
              )}
              <span>
                {isSyncingCloud
                  ? 'Đang đồng bộ...'
                  : !isCloudConnected
                  ? `Kết nối Google Đám mây${pendingSyncCount > 0 ? ` & Đồng bộ (${pendingSyncCount})` : ''}`
                  : `Đồng bộ lên Đám mây (${pendingSyncCount})`}
              </span>
            </button>
          </div>
        )}

        {cloudNotice && (
          <div
            className={`p-3.5 rounded-2xl border shadow-xs flex items-center justify-between gap-3 text-xs font-medium ${
              cloudNotice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {cloudNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <CloudOff className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>{cloudNotice.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setCloudNotice(null)}
              className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
              aria-label="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {activePage === 'about' ? (
          <AboutPage onBackHome={navigateToHome} />
        ) : activePage === 'author' ? (
          <AuthorPage onBackHome={navigateToHome} />
        ) : isLoading ? (
          <div className="py-12 px-6 max-w-md mx-auto rounded-2xl bg-white/85 backdrop-blur-md border border-sky-100 shadow-xs text-center text-slate-500 text-sm">
            Đang khởi động không gian học liệu số...
          </div>
        ) : (
          <div className="space-y-14">
            {/* Zone 0: Không gian ảo 3D */}
            <ZoneVirtualSpaces
              items={virtualSpaceItems}
              role={role}
              currentUser={currentUser}
              onSelectZone={() => navigateToZone('virtual_spaces')}
              onEditItem={handleOpenEditModal}
              onDeleteItem={handlePromptDelete}
              avatarUrl={branding.virtualSpacesAvatar}
              onUploadAvatar={(url) =>
                handleUpdateBranding({ ...branding, virtualSpacesAvatar: url })
              }
              onRemoveAvatar={() => {
                const next = { ...branding };
                delete next.virtualSpacesAvatar;
                handleUpdateBranding(next);
              }}
              onLaunchSpace={(item) => handleLaunchContentWithCredits(item, 'access', setRunningApp)}
            />

            {/* Zone 1: Kho Ứng Dụng */}
            <ZoneAppsRepository
              items={appItems}
              role={role}
              currentUser={currentUser}
              onOpenAuth={handleOpenAuth}
              onSelectZone={() => navigateToZone('apps')}
              onEditItem={handleOpenEditModal}
              onDeleteItem={handlePromptDelete}
              avatarUrl={branding.appsAvatar}
              onUploadAvatar={(url) => handleUpdateBranding({ ...branding, appsAvatar: url })}
              onRemoveAvatar={() => {
                const next = { ...branding };
                delete next.appsAvatar;
                handleUpdateBranding(next);
              }}
              onLaunchApp={(item) => handleLaunchContentWithCredits(item, 'access', setRunningApp)}
            />

            {/* Zone 2: Học Liệu Số */}
            <ZoneInteractiveGames
              items={gameItems}
              role={role}
              currentUser={currentUser}
              onSelectZone={() => navigateToZone('games')}
              avatarUrl={branding.gamesAvatar}
              onUploadAvatar={(url) => handleUpdateBranding({ ...branding, gamesAvatar: url })}
              onRemoveAvatar={() => {
                const next = { ...branding };
                delete next.gamesAvatar;
                handleUpdateBranding(next);
              }}
              onEditItem={handleOpenEditModal}
              onDeleteItem={handlePromptDelete}
              onViewGame={(item) => handleLaunchContentWithCredits(item, 'access', setViewingItem)}
              onPlayGame={(item) => handleLaunchContentWithCredits(item, 'access', setPlayingGame)}
            />

            {/* Zone 3: Thí Nghiệm Mô Phỏng */}
            <ZoneSimulations
              items={simItems}
              role={role}
              currentUser={currentUser}
              onSelectZone={() => navigateToZone('simulations')}
              avatarUrl={branding.simsAvatar}
              onUploadAvatar={(url) => handleUpdateBranding({ ...branding, simsAvatar: url })}
              onRemoveAvatar={() => {
                const next = { ...branding };
                delete next.simsAvatar;
                handleUpdateBranding(next);
              }}
              onEditItem={handleOpenEditModal}
              onDeleteItem={handlePromptDelete}
              onViewSimulation={(item) =>
                handleLaunchContentWithCredits(item, 'access', setViewingItem)
              }
              onLaunchSimulation={(item) =>
                handleLaunchContentWithCredits(item, 'access', setRunningSimulation)
              }
            />

            {/* Zone 4: Ứng dụng Tiện ích */}
            <ZoneManagementSoftware
              items={managementItems}
              role={role}
              currentUser={currentUser}
              onSelectZone={() => navigateToZone('management')}
              avatarUrl={branding.managementAvatar}
              onUploadAvatar={(url) =>
                handleUpdateBranding({ ...branding, managementAvatar: url })
              }
              onRemoveAvatar={() => {
                const next = { ...branding };
                delete next.managementAvatar;
                handleUpdateBranding(next);
              }}
              onEditItem={handleOpenEditModal}
              onDeleteItem={handlePromptDelete}
              onViewSoftware={(item) => handleLaunchContentWithCredits(item, 'view', setViewingItem)}
              onLaunchSoftware={(item) =>
                handleLaunchContentWithCredits(item, 'access', setRunningApp)
              }
            />

            {/* Zone 5: Hướng dẫn sử dụng */}
            <ZoneGuides
              items={guideItems}
              role={role}
              currentUser={currentUser}
              onSelectZone={() => navigateToZone('guides')}
              avatarUrl={branding.guidesAvatar}
              onUploadAvatar={(url) =>
                handleUpdateBranding({ ...branding, guidesAvatar: url })
              }
              onRemoveAvatar={() => {
                const next = { ...branding };
                delete next.guidesAvatar;
                handleUpdateBranding(next);
              }}
              onEditItem={handleOpenEditModal}
              onDeleteItem={handlePromptDelete}
              onViewGuide={(item) => {
                setSelectedItem(item);
                setDeepLinkBannerItem(null);
                setActiveZoneRoute('guides');
                setActiveSection('huong-dan');
                pushUrlPath(buildItemPath(item));
                setViewingItem(item);
              }}
              onLaunchGuide={(item) => {
                setSelectedItem(item);
                setDeepLinkBannerItem(null);
                setActiveZoneRoute('guides');
                setActiveSection('huong-dan');
                pushUrlPath(buildItemPath(item));
                setRunningApp(item);
              }}
            />
          </div>
        )}
      </main>

      {/* Fixed Footer */}
      <Footer />

      {/* Modals & Dialogs */}
      <ContentViewModal
        item={viewingItem}
        userRole={role}
        onNavigateHome={navigateToHome}
        onNavigateZone={() =>
          viewingItem ? navigateToZone(viewingItem.zone) : navigateToHome()
        }
        onClose={() => {
          const z = viewingItem?.zone;
          setViewingItem(null);
          if (z) pushUrlPath(buildZonePath(z));
        }}
      />

      <AddEditContentModal
        isOpen={isAddEditModalOpen}
        defaultZone={targetZone}
        editingItem={editingItem}
        isCloudConnected={isCloudConnected}
        onSave={handleSaveItem}
        onClose={() => {
          setIsAddEditModalOpen(false);
          setEditingItem(null);
        }}
      />

      <ConfirmDeleteModal
        isOpen={Boolean(itemToDelete)}
        title="Xác nhận xóa nội dung"
        itemTitle={itemToDelete?.title || ''}
        onConfirm={handleConfirmDelete}
        onCancel={() => setItemToDelete(null)}
      />

      <AppPlayerModal
        item={runningApp}
        teacherId={activeTeacherId}
        userRole={role}
        initialAppData={runningApp ? teacherAppData[runningApp.id] : undefined}
        externalSyncEvent={externalSyncEvent}
        onStorageMutation={handleTeacherStorageMutation}
        onNavigateHome={navigateToHome}
        onNavigateZone={() =>
          runningApp ? navigateToZone(runningApp.zone) : navigateToZone('apps')
        }
        onClose={() => {
          const z = runningApp?.zone || 'apps';
          setRunningApp(null);
          pushUrlPath(buildZonePath(z));
        }}
      />

      <GamePlayerModal
        item={playingGame}
        teacherId={activeTeacherId}
        userRole={role}
        initialAppData={playingGame ? teacherAppData[playingGame.id] : undefined}
        externalSyncEvent={externalSyncEvent}
        onStorageMutation={handleTeacherStorageMutation}
        onNavigateHome={navigateToHome}
        onNavigateZone={() => navigateToZone('games')}
        onClose={() => {
          setPlayingGame(null);
          pushUrlPath(buildZonePath('games'));
        }}
      />

      <SimulationPlayerModal
        item={runningSimulation}
        teacherId={activeTeacherId}
        userRole={role}
        initialAppData={runningSimulation ? teacherAppData[runningSimulation.id] : undefined}
        externalSyncEvent={externalSyncEvent}
        onStorageMutation={handleTeacherStorageMutation}
        onNavigateHome={navigateToHome}
        onNavigateZone={() => navigateToZone('simulations')}
        onClose={() => {
          setRunningSimulation(null);
          pushUrlPath(buildZonePath('simulations'));
        }}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onSuccess={handleAuthSuccess}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <RedeemCodeModal
        isOpen={isCreditModalOpen}
        user={currentUser}
        reasonMessage={creditModalReason}
        pendingItemTitle={pendingLaunch ? pendingLaunch.item.title : undefined}
        requiredCredits={requiredCreditsForModal}
        onUserUpdated={(updated) => {
          authService.setCurrentUser(updated);
          setCurrentUser(updated);
          setRole(authService.getCurrentRole());
        }}
        onContinueAfterRedeem={async (updatedUser) => {
          const nextLaunch = pendingLaunch;
          setIsCreditModalOpen(false);
          setCreditModalReason(undefined);
          setPendingLaunch(null);
          if (nextLaunch) {
            await handleLaunchContentWithCredits(
              nextLaunch.item,
              nextLaunch.action,
              nextLaunch.opener,
              updatedUser
            );
          }
        }}
        onClose={() => {
          setIsCreditModalOpen(false);
          setPendingLaunch(null);
        }}
      />

      <AdminPanelModal
        isOpen={isAdminPanelOpen}
        initialTab={adminPanelTab}
        isCloudConnected={isCloudConnected}
        onClose={() => setIsAdminPanelOpen(false)}
        onLogout={handleLogout}
        branding={branding}
        onUpdateBranding={handleUpdateBranding}
        managementItems={managementItems}
        onUpdateItemCreditCost={handleUpdateManagementItemPrice}
        contentCounts={{
          virtualSpaces: virtualSpaceItems.length,
          apps: appItems.length,
          games: gameItems.length,
          simulations: simItems.length,
          management: managementItems.length,
          guides: guideItems.length,
        }}
      />
    </div>
  );
}
