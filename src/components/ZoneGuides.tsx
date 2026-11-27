import React, { useRef, useState } from 'react';
import {
  PlayCircle,
  Play,
  Trash2,
  Edit3,
  Camera,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { ContentItem, UserRole, UserAccount } from '../types';
import { processImageFile } from '../utils/image';

interface ZoneGuidesProps {
  items: ContentItem[];
  role: UserRole;
  currentUser?: UserAccount | null;
  avatarUrl?: string;
  onUploadAvatar?: (dataUrl: string) => void;
  onRemoveAvatar?: () => void;
  onSelectZone?: () => void;
  onEditItem: (item: ContentItem) => void;
  onDeleteItem: (item: ContentItem) => void;
  onViewGuide?: (item: ContentItem) => void;
  onLaunchGuide: (item: ContentItem) => void;
}

export const ZoneGuides: React.FC<ZoneGuidesProps> = ({
  items,
  role,
  avatarUrl,
  onUploadAvatar,
  onRemoveAvatar,
  onSelectZone,
  onEditItem,
  onDeleteItem,
  onLaunchGuide,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canManage = role === 'admin';
  const isAdmin = role === 'admin';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadAvatar) return;
    setUploadError(null);
    try {
      const dataUrl = await processImageFile(file, 600);
      onUploadAvatar(dataUrl);
    } catch (err: any) {
      setUploadError(err.message || 'Lỗi khi xử lý hình ảnh');
    }
    e.target.value = '';
  };

  return (
    <section id="huong-dan" className="scroll-mt-36 space-y-4">
      {/* Hidden file input for Admin */}
      {isAdmin && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
      )}

      {/* Zone Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rose-200/70">
        <div className="flex items-center gap-3">
          <div
            className={`relative ${isAdmin ? 'cursor-pointer group' : ''}`}
            onClick={() => isAdmin && fileInputRef.current?.click()}
            title={isAdmin ? 'Quản trị viên nhấn để thêm / thay đổi hình đại diện' : undefined}
          >
            {avatarUrl ? (
              <div className="w-13 h-13 rounded-2xl overflow-hidden border-2 border-rose-400 shadow-md bg-slate-100 relative">
                <img src={avatarUrl} alt="Hướng dẫn" className="w-full h-full object-cover" />
                {isAdmin && (
                  <div className="absolute inset-0 bg-rose-950/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                    <Camera className="w-4 h-4" />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
                <PlayCircle className="w-6 h-6" />
              </div>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="absolute -bottom-1 -right-1 p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-full shadow-xs cursor-pointer"
                title="Đổi hình đại diện Hướng dẫn"
              >
                <Camera className="w-3 h-3" />
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onSelectZone}
                className="text-xl font-bold text-slate-900 hover:text-rose-700 font-display transition-colors cursor-pointer text-left"
              >
                Hướng dẫn
              </button>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-rose-100 text-rose-900">
                {items.length} hướng dẫn
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Video và tài liệu hướng dẫn dành cho giáo viên và học sinh
            </p>

            {/* Admin dedicated avatar toolbar */}
            {isAdmin && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 text-xs font-bold border border-rose-200 shadow-2xs transition-colors cursor-pointer"
                  title="Tải lên hoặc thay đổi hình đại diện Hướng dẫn"
                >
                  <Camera className="w-3.5 h-3.5 text-rose-600" />
                  <span>{avatarUrl ? 'Thay đổi hình đại diện' : 'Thêm hình đại diện'}</span>
                </button>
                {avatarUrl && onRemoveAvatar && (
                  <button
                    type="button"
                    onClick={onRemoveAvatar}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
                    title="Xóa hình đại diện và khôi phục biểu tượng mặc định"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Xóa hình</span>
                  </button>
                )}
              </div>
            )}
            {uploadError && (
              <p className="text-xs text-rose-600 mt-1 font-medium">{uploadError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Content Grid or Empty State */}
      {items.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-rose-200 bg-white/80 backdrop-blur-md p-12 text-center flex flex-col items-center justify-center transition-all hover:bg-white/90 shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-white shadow-xs border border-rose-100 text-rose-500 flex items-center justify-center mb-3">
            <PlayCircle className="w-8 h-8 stroke-[1.5]" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 mb-1">
            Khu vực hướng dẫn đang trống
          </h3>
          <p className="text-xs text-slate-600 max-w-md leading-relaxed">
            Chưa có video hoặc tài liệu hướng dẫn nào trong khu vực này.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <div
              key={item.id}
              className="group bg-white/95 backdrop-blur-sm rounded-2xl border border-rose-100/90 hover:border-rose-300 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
            >
              {/* Hình nền trang trí thẻ Hướng dẫn (không hiển thị màn hình chính) */}
              <div
                onClick={() => onLaunchGuide(item)}
                className="relative h-36 bg-gradient-to-br from-rose-600 via-pink-600 to-orange-500 overflow-hidden cursor-pointer flex items-center justify-center p-4"
              >
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 20% 25%, #ffffff 2px, transparent 2px), radial-gradient(circle at 80% 75%, #ffffff 2px, transparent 2px)',
                    backgroundSize: '28px 28px',
                  }}
                />
                <div
                  aria-hidden="true"
                  className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/15 blur-xl"
                />
                <div
                  aria-hidden="true"
                  className="absolute -left-8 -bottom-8 w-28 h-28 rounded-full bg-amber-300/20 blur-xl"
                />

                {avatarUrl && (
                  <img
                    src={avatarUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-overlay group-hover:scale-105 transition-transform duration-500"
                  />
                )}

                <div className="relative z-10 flex flex-col items-center gap-2 text-white">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <PlayCircle className="w-7 h-7 text-white" />
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-slate-950/25 border border-white/25 text-white/95">
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    <span>Hướng dẫn sử dụng</span>
                  </span>
                </div>
              </div>

              {/* Tên & Nút Bắt đầu */}
              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <h3
                    onClick={() => onLaunchGuide(item)}
                    className="text-[15px] font-bold text-slate-900 hover:text-rose-600 cursor-pointer font-display leading-snug"
                    title={item.title}
                  >
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="text-xs font-semibold text-rose-700 leading-snug">
                      {item.description}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onLaunchGuide(item)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-98 text-white font-bold text-xs shadow-sm shadow-rose-600/20 transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Bắt đầu</span>
                  </button>

                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="Sửa hướng dẫn"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteItem(item)}
                        className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="Xóa hướng dẫn này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
