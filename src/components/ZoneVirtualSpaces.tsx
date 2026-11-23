import React, { useRef, useState } from 'react';
import {
  Box,
  Play,
  Camera,
  RotateCcw,
  Sparkles,
  Globe,
  Edit3,
  Trash2,
} from 'lucide-react';
import { ContentItem, UserRole, UserAccount } from '../types';
import { processImageFile } from '../utils/image';

interface ZoneVirtualSpacesProps {
  items: ContentItem[];
  role: UserRole;
  currentUser: UserAccount | null;
  avatarUrl?: string;
  onUploadAvatar?: (dataUrl: string) => void;
  onRemoveAvatar?: () => void;
  onSelectZone?: () => void;
  onEditItem?: (item: ContentItem) => void;
  onDeleteItem?: (item: ContentItem) => void;
  onLaunchSpace: (item: ContentItem) => void;
}

function getVirtualSpaceIconConfig(title: string): {
  Icon: React.FC<{ className?: string }>;
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  const lower = title.toLowerCase();
  if (lower.includes('trưng bày') || lower.includes('triển lãm') || lower.includes('ai')) {
    return {
      Icon: Sparkles,
      bgClass: 'from-emerald-50 to-teal-100',
      textClass: 'text-emerald-600',
      borderClass: 'border-emerald-200',
    };
  }
  if (lower.includes('lớp học') || lower.includes('phòng học')) {
    return {
      Icon: Box,
      bgClass: 'from-cyan-50 to-sky-100',
      textClass: 'text-cyan-600',
      borderClass: 'border-cyan-200',
    };
  }
  return {
    Icon: Globe,
    bgClass: 'from-teal-50 to-emerald-100',
    textClass: 'text-teal-600',
    borderClass: 'border-teal-200',
  };
}

export const ZoneVirtualSpaces: React.FC<ZoneVirtualSpacesProps> = ({
  items,
  role,
  avatarUrl,
  onUploadAvatar,
  onRemoveAvatar,
  onSelectZone,
  onEditItem,
  onDeleteItem,
  onLaunchSpace,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    <section id="khong-gian-ao-3d" className="scroll-mt-36 space-y-4">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-200/75">
        <div className="flex items-center gap-3">
          <div
            className={`relative ${isAdmin ? 'cursor-pointer group' : ''}`}
            onClick={() => isAdmin && fileInputRef.current?.click()}
            title={isAdmin ? 'Quản trị viên nhấn để thêm / thay đổi hình đại diện' : undefined}
          >
            {avatarUrl ? (
              <div className="w-13 h-13 rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-md bg-slate-100 relative">
                <img src={avatarUrl} alt="Không gian ảo 3D" className="w-full h-full object-cover" />
                {isAdmin && (
                  <div className="absolute inset-0 bg-emerald-950/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                    <Camera className="w-4 h-4" />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                <Box className="w-6 h-6" />
              </div>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="absolute -bottom-1 -right-1 p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-xs cursor-pointer"
                title="Đổi hình đại diện Không gian ảo 3D"
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
                className="text-xl font-bold text-slate-900 hover:text-emerald-700 font-display transition-colors cursor-pointer text-left"
              >
                Không gian ảo 3D
              </button>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                {items.length} không gian
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Phòng trưng bày sản phẩm số &amp; lớp học ảo 3D tương tác trực quan
            </p>

            {isAdmin && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 shadow-2xs transition-colors cursor-pointer"
                  title="Tải lên hoặc thay đổi hình đại diện Không gian ảo 3D"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{avatarUrl ? 'Thay đổi hình đại diện' : 'Thêm hình đại diện'}</span>
                </button>
                {avatarUrl && onRemoveAvatar && (
                  <button
                    type="button"
                    onClick={onRemoveAvatar}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition-colors cursor-pointer"
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

      {/* Content Area */}
      {items.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-emerald-200 bg-white/80 backdrop-blur-md p-12 text-center flex flex-col items-center justify-center transition-all hover:bg-white/90 shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-white shadow-xs border border-emerald-100 text-emerald-500 flex items-center justify-center mb-3">
            <Box className="w-8 h-8 stroke-[1.5]" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 mb-1">
            Không gian ảo 3D đang trống
          </h3>
          <p className="text-xs text-slate-600 max-w-md leading-relaxed">
            Chưa có không gian ảo 3D nào được hiển thị.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => {
            const { Icon, bgClass, textClass, borderClass } = getVirtualSpaceIconConfig(item.title);
            return (
              <div
                key={item.id}
                className="group bg-white/95 backdrop-blur-sm rounded-2xl border border-emerald-100/90 hover:border-emerald-300 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${bgClass} border ${borderClass} ${textClass} flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="w-7 h-7" />
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                      Không gian 3D
                    </span>
                  </div>

                  <div>
                    <h3
                      className="text-base font-bold text-slate-900 line-clamp-2 font-display leading-snug"
                      title={item.title}
                    >
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-xs text-slate-500 line-clamp-3 mt-1.5 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onLaunchSpace(item)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Bắt đầu</span>
                  </button>

                  {isAdmin && onEditItem && onDeleteItem && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                        title="Chỉnh sửa không gian ảo 3D"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteItem(item)}
                        className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="Xóa không gian ảo 3D"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
