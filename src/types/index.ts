export type ContentType = 'virtual_space' | 'app' | 'game' | 'simulation' | 'management' | 'guide';

export type ZoneType = 'virtual_spaces' | 'apps' | 'games' | 'simulations' | 'management' | 'guides';

export interface ContentItem {
  id: string;
  zone: ZoneType;
  title: string;
  description?: string;
  type: ContentType;
  createdAt: number;
  updatedAt: number;
  order: number;

  // Legacy optional metadata
  grade?: string;
  subject?: string;

  // App, Game & Simulation HTML embed code
  embedCode?: string;
  instructions?: string;

  // Custom AI credit cost per item (used in Ứng dụng Tiện ích / management)
  creditCost?: number;
}

export type UserRole = 'guest' | 'teacher' | 'admin';

export type CreditActionType = 'view' | 'access';

export const INITIAL_FREE_CREDITS = 20;
export const DAILY_FREE_CREDITS = 20;
export const DAILY_FREE_RESET_MS = 24 * 60 * 60 * 1000;
export const CREDIT_COST_STANDARD_ACCESS = 4; // Truy cập Không gian ảo 3D, Kho ứng dụng, Học liệu số, Thí nghiệm mô phỏng
export const CREDIT_COST_VIEW = CREDIT_COST_STANDARD_ACCESS;
export const CREDIT_COST_ACCESS = CREDIT_COST_STANDARD_ACCESS;
export const MIN_CREDIT_COST = CREDIT_COST_STANDARD_ACCESS;
export const APP_LAUNCH_CREDIT_COST = CREDIT_COST_STANDARD_ACCESS;
export const MAX_CUSTOM_CREDIT_COST = 100000;

export function normalizeCreditCost(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(MAX_CUSTOM_CREDIT_COST, Math.floor(value)));
}

export function getItemCreditCost(
  item?: Pick<ContentItem, 'zone' | 'creditCost'> | null
): number {
  if (!item) return CREDIT_COST_STANDARD_ACCESS;
  if (item.zone === 'guides') return 0;
  if (item.zone === 'management') {
    return normalizeCreditCost(item.creditCost) ?? 0;
  }
  return CREDIT_COST_STANDARD_ACCESS;
}

export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  photoURL?: string;
  school?: string;
  role: 'admin' | 'teacher';
  status: 'active' | 'blocked';
  credits: number;
  usedCredits?: number;
  lastFreeResetAt?: number;
  createdAt: number;
  updatedAt?: number;
}

export interface SiteBranding {
  homeAvatar?: string;
  virtualSpacesAvatar?: string;
  appsAvatar?: string;
  gamesAvatar?: string;
  simsAvatar?: string;
  managementAvatar?: string;
  guidesAvatar?: string;
}
