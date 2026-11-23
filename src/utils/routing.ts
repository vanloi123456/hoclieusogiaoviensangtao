import { ContentItem, ZoneType } from '../types';

export interface ZoneRouteMeta {
  zone: ZoneType;
  slug: string;
  sectionId: string;
  label: string;
}

export const ZONE_ROUTES: Record<ZoneType, ZoneRouteMeta> = {
  virtual_spaces: {
    zone: 'virtual_spaces',
    slug: 'khong-gian-ao-3d',
    sectionId: 'khong-gian-ao-3d',
    label: 'Không gian ảo 3D',
  },
  apps: {
    zone: 'apps',
    slug: 'kho-ung-dung',
    sectionId: 'kho-ung-dung',
    label: 'Kho Ứng Dụng',
  },
  games: {
    zone: 'games',
    slug: 'hoc-lieu-so',
    sectionId: 'tro-choi-tuong-tac',
    label: 'Học Liệu Số',
  },
  simulations: {
    zone: 'simulations',
    slug: 'thi-nghiem-mo-phong',
    sectionId: 'thi-nghiem-mo-phong',
    label: 'Thí Nghiệm Mô Phỏng',
  },
  management: {
    zone: 'management',
    slug: 'ung-dung-tien-ich',
    sectionId: 'ung-dung-tien-ich',
    label: 'Ứng dụng Tiện ích',
  },
  guides: {
    zone: 'guides',
    slug: 'huong-dan',
    sectionId: 'huong-dan',
    label: 'Hướng dẫn',
  },
};

export function slugifyVietnamese(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function getZoneFromSectionId(sectionId: string): ZoneType | null {
  if (sectionId === 'khong-gian-ao-3d') return 'virtual_spaces';
  if (sectionId === 'kho-ung-dung') return 'apps';
  if (sectionId === 'tro-choi-tuong-tac' || sectionId === 'hoc-lieu-so') return 'games';
  if (sectionId === 'thi-nghiem-mo-phong') return 'simulations';
  if (sectionId === 'ung-dung-tien-ich' || sectionId === 'phan-mem-quan-ly') return 'management';
  if (sectionId === 'huong-dan' || sectionId === 'huong-dan-su-dung') return 'guides';
  return null;
}

export function buildHomePath(): string {
  return '/';
}

export function buildAboutPath(): string {
  return '/gioi-thieu';
}

export function buildAuthorPath(): string {
  return '/ve-tac-gia';
}

export function buildZonePath(zone: ZoneType): string {
  return `/${ZONE_ROUTES[zone].slug}`;
}

export function buildItemPath(item: ContentItem): string {
  const zoneSlug = ZONE_ROUTES[item.zone]?.slug || 'kho-ung-dung';
  const titleSlug = slugifyVietnamese(item.title);
  return titleSlug
    ? `/${zoneSlug}/${titleSlug}--${item.id}`
    : `/${zoneSlug}/${item.id}`;
}

export interface ParsedRoute {
  type: 'home' | 'about' | 'author' | 'zone' | 'item';
  zone?: ZoneType;
  itemSlugOrId?: string;
}

export function parsePathname(pathname: string): ParsedRoute {
  const cleaned = (pathname || '/').replace(/^\/+|\/+$/g, '');
  if (!cleaned) {
    return { type: 'home' };
  }

  const parts = cleaned.split('/').filter(Boolean);
  const firstSegment = decodeURIComponent(parts[0] || '').toLowerCase();

  if (firstSegment === 'gioi-thieu' || firstSegment === 'about') {
    return { type: 'about' };
  }

  if (firstSegment === 've-tac-gia' || firstSegment === 'tac-gia' || firstSegment === 'author') {
    return { type: 'author' };
  }

  let matchedZone: ZoneType | undefined;
  if (firstSegment === 'khong-gian-ao-3d' || firstSegment === 'virtual-spaces') {
    matchedZone = 'virtual_spaces';
  } else if (firstSegment === 'kho-ung-dung' || firstSegment === 'apps') {
    matchedZone = 'apps';
  } else if (
    firstSegment === 'hoc-lieu-so' ||
    firstSegment === 'tro-choi-tuong-tac' ||
    firstSegment === 'games'
  ) {
    matchedZone = 'games';
  } else if (firstSegment === 'thi-nghiem-mo-phong' || firstSegment === 'simulations') {
    matchedZone = 'simulations';
  } else if (
    firstSegment === 'ung-dung-tien-ich' ||
    firstSegment === 'phan-mem-quan-ly' ||
    firstSegment === 'management'
  ) {
    matchedZone = 'management';
  } else if (
    firstSegment === 'huong-dan' ||
    firstSegment === 'huong-dan-su-dung' ||
    firstSegment === 'guides'
  ) {
    matchedZone = 'guides';
  }

  if (!matchedZone) {
    return { type: 'home' };
  }

  if (parts.length >= 2 && parts[1]) {
    const rawSegment = decodeURIComponent(parts[1]);
    return {
      type: 'item',
      zone: matchedZone,
      itemSlugOrId: rawSegment,
    };
  }

  return {
    type: 'zone',
    zone: matchedZone,
  };
}

export function findItemByRouteSegment(
  items: ContentItem[],
  segment: string,
  zone?: ZoneType
): ContentItem | null {
  if (!segment) return null;
  const pool = zone ? items.filter((i) => i.zone === zone) : items;

  // Format: "<slug>--<id>"
  const doubleDashIdx = segment.lastIndexOf('--');
  const candidateId = doubleDashIdx >= 0 ? segment.slice(doubleDashIdx + 2) : segment;

  const exactById =
    pool.find((i) => i.id === candidateId) || items.find((i) => i.id === candidateId);
  if (exactById) return exactById;

  const slugLower = segment.toLowerCase();
  return (
    pool.find((i) => slugifyVietnamese(i.title) === slugLower) ||
    items.find((i) => slugifyVietnamese(i.title) === slugLower) ||
    null
  );
}
