import React, { useEffect, useMemo } from 'react';
import {
  X,
  Cpu,
  Gamepad2,
  FlaskConical,
  FolderKanban,
  PlayCircle,
  Eye,
  Home,
  ChevronRight,
  ExternalLink,
  Box,
} from 'lucide-react';
import { ContentItem, UserRole } from '../types';
import { classifyAppSource, generateSandboxHtml } from '../utils/embed';

interface ContentViewModalProps {
  item: ContentItem | null;
  userRole?: UserRole;
  onNavigateHome?: () => void;
  onNavigateZone?: () => void;
  onClose: () => void;
}

export const ContentViewModal: React.FC<ContentViewModalProps> = ({
  item,
  userRole = 'guest',
  onNavigateHome,
  onNavigateZone,
  onClose,
}) => {
  useEffect(() => {
    if (!item) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [item, onClose]);

  const sourceInfo = useMemo(() => classifyAppSource(item?.embedCode), [item?.embedCode]);
  const disableNewTab = useMemo(() => {
    if (!item) return false;
    if (item.zone === 'games') return true;
    const titleLower = (item.title || '').toLowerCase();
    const urlLower = (sourceInfo.url || '').toLowerCase();
    return (
      item.id === 'item_lophocaophienban2_3d' ||
      item.id === 'item_ngontay_vercel' ||
      item.id === 'item_nghiengdau_vercel' ||
      (titleLower.includes('lớp học ảo 3d') && titleLower.includes('phiên bản 2')) ||
      titleLower.includes('giơ ngón tay') ||
      titleLower.includes('trả lời bằng ngón tay') ||
      titleLower.includes('nghiêng đầu chọn đáp án') ||
      urlLower.includes('lophocaophienban2.vercel.app') ||
      urlLower.includes('thuthachtraloibangngontay.vercel.app') ||
      urlLower.includes('nghiengdauchondapan.vercel.app')
    );
  }, [item, sourceInfo.url]);

  const previewHtml = useMemo(() => {
    if (!item?.embedCode || sourceInfo.iframeBlockedLikely) return '';
    return generateSandboxHtml(item.embedCode, {
      teacherId: 'preview_readonly',
      itemId: item.id,
      readOnly: true,
      role: userRole,
    });
  }, [item?.id, item?.embedCode, sourceInfo.iframeBlockedLikely, userRole]);

  if (!item) return null;

  const zoneMeta =
    item.zone === 'virtual_spaces'
      ? {
          label: 'Không gian ảo 3D',
          Icon: Box,
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          iconBgClass: 'bg-emerald-100 text-emerald-600',
        }
      : item.zone === 'games'
      ? {
          label: 'Học Liệu Số',
          Icon: Gamepad2,
          badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          iconBgClass: 'bg-indigo-100 text-indigo-600',
        }
      : item.zone === 'simulations'
      ? {
          label: 'Thí Nghiệm Mô Phỏng',
          Icon: FlaskConical,
          badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
          iconBgClass: 'bg-teal-100 text-teal-600',
        }
      : item.zone === 'management'
      ? {
          label: 'Ứng dụng Tiện ích',
          Icon: FolderKanban,
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          iconBgClass: 'bg-amber-100 text-amber-700',
        }
      : item.zone === 'guides'
      ? {
          label: 'Hướng dẫn',
          Icon: PlayCircle,
          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
          iconBgClass: 'bg-rose-100 text-rose-600',
        }
      : {
          label: 'Kho Ứng Dụng',
          Icon: Cpu,
          badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
          iconBgClass: 'bg-sky-100 text-sky-600',
        };

  const ZoneIcon = zoneMeta.Icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-sky-100 overflow-hidden my-6 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 bg-gradient-to-r from-sky-50 via-white to-slate-50 border-b border-sky-100">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${zoneMeta.iconBgClass}`}
            >
              <ZoneIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-1 text-[11px] text-slate-600 font-medium flex-wrap mb-1"
              >
                <button
                  type="button"
                  onClick={onNavigateHome || onClose}
                  className="inline-flex items-center gap-1 hover:text-sky-700 transition-colors cursor-pointer"
                >
                  <Home className="w-3 h-3 text-sky-600" />
                  <span>Trang chủ</span>
                </button>
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                <button
                  type="button"
                  onClick={onNavigateZone || onClose}
                  className="hover:text-sky-700 transition-colors cursor-pointer"
                >
                  {zoneMeta.label}
                </button>
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                  {item.title}
                </span>
                <span
                  className={`ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${zoneMeta.badgeClass}`}
                >
                  <Eye className="w-3 h-3" />
                  <span>Xem nội dung</span>
                </span>
              </nav>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 font-display leading-snug">
                  {item.title}
                </h2>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {item.description && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-sm text-slate-700 leading-relaxed">
              {item.description}
            </div>
          )}

          {sourceInfo.iframeBlockedLikely && sourceInfo.url ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-8 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center">
                <ExternalLink className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-900">
                Liên kết {sourceInfo.label}
              </p>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                Do chính sách bảo mật của {sourceInfo.label}, liên kết này không thể xem trước trực tiếp trong khung nhúng.
                {!disableNewTab && ' Bạn có thể mở liên kết trong tab mới để xem đầy đủ.'}
              </p>
              {!disableNewTab && (
                <a
                  href={sourceInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-xs transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Mở trên {sourceInfo.label}</span>
                </a>
              )}
            </div>
          ) : previewHtml ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-950 overflow-hidden shadow-inner">
              <div className="px-4 py-2 bg-slate-900 text-[11px] font-semibold text-slate-300 border-b border-slate-800 flex items-center justify-between">
                <span>Bản xem trước nội dung (chế độ chỉ xem)</span>
                {sourceInfo.url && !disableNewTab && (
                  <a
                    href={sourceInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Mở tab mới</span>
                  </a>
                )}
              </div>
              <div className="aspect-video w-full bg-white">
                <iframe
                  srcDoc={previewHtml}
                  title={`Xem trước: ${item.title}`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                  allow="accelerometer; autoplay; camera; clipboard-write; encrypted-media; gyroscope; microphone; picture-in-picture; fullscreen"
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
              Nội dung này hiện chưa có bản xem trước trực quan.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
