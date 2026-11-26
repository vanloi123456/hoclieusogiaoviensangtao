import React, { useRef, useState } from 'react';
import {
  FolderKanban,
  Play,
  Trash2,
  Edit3,
  Camera,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { ContentItem, UserRole, UserAccount } from '../types';
import { processImageFile } from '../utils/image';

interface ZoneManagementSoftwareProps {
  items: ContentItem[];
  role: UserRole;
  currentUser?: UserAccount | null;
  avatarUrl?: string;
  onUploadAvatar?: (dataUrl: string) => void;
  onRemoveAvatar?: () => void;
  onSelectZone?: () => void;
  onEditItem: (item: ContentItem) => void;
  onDeleteItem: (item: ContentItem) => void;
  onViewSoftware: (item: ContentItem) => void;
  onLaunchSoftware: (item: ContentItem) => void;
}

export const ZoneManagementSoftware: React.FC<ZoneManagementSoftwareProps> = ({
  items,
  role,
  avatarUrl,
  onUploadAvatar,
  onRemoveAvatar,
  onSelectZone,
  onEditItem,
  onDeleteItem,
  onViewSoftware,
  onLaunchSoftware,
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
    <section id="ung-dung-tien-ich" className="scroll-mt-36 space-y-4">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/70">
        <div className="flex items-center gap-3">
          <div
            className={`relative ${isAdmin ? 'cursor-pointer group' : ''}`}
            onClick={() => isAdmin && fileInputRef.current?.click()}
            title={isAdmin ? 'Quản trị viên nhấn để thêm / thay đổi hình đại diện' : undefined}
          >
            {avatarUrl ? (
              <div className="w-13 h-13 rounded-2xl overflow-hidden border-2 border-amber-400 shadow-md bg-slate-100 relative">
                <img src={avatarUrl} alt="Ứng dụng Tiện ích" className="w-full h-full object-cover" />
                {isAdmin && (
                  <div className="absolute inset-0 bg-amber-950/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                    <Camera className="w-4 h-4" />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                <FolderKanban className="w-6 h-6" />
              </div>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="absolute -bottom-1 -right-1 p-1 bg-amber-600 hover:bg-amber-700 text-white rounded-full shadow-xs cursor-pointer"
                title="Đổi hình đại diện Ứng dụng Tiện ích"
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
                className="text-xl font-bold text-slate-900 hover:text-amber-700 font-display transition-colors cursor-pointer text-left"
              >
                Ứng dụng Tiện ích
              </button>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">
                {items.length} ứng dụng
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Ứng dụng tiện ích hỗ trợ giảng dạy &amp; quản lý
            </p>

            {/* Admin dedicated avatar action toolbar */}
            {isAdmin && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold border border-amber-200 shadow-2xs transition-colors cursor-pointer"
                  title="Tải lên hoặc thay đổi hình đại diện Ứng dụng Tiện ích"
                >
                  <Camera className="w-3.5 h-3.5 text-amber-600" />
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

      {/* Content Grid or Empty State */}
      {items.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-amber-200 bg-white/80 backdrop-blur-md p-12 text-center flex flex-col items-center justify-center transition-all hover:bg-white/90 shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-white shadow-xs border border-amber-100 text-amber-500 flex items-center justify-center mb-3">
            <FolderKanban className="w-8 h-8 stroke-[1.5]" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 mb-1">
            Khu vực ứng dụng tiện ích đang trống
          </h3>
          <p className="text-xs text-slate-600 max-w-md leading-relaxed">
            Chưa có ứng dụng tiện ích nào trong khu vực này.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <div
              key={item.id}
              className="group bg-white/95 backdrop-blur-sm rounded-2xl border border-amber-100/90 hover:border-amber-300 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3.5">
                <div className="flex items-start gap-3">
                  <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 border border-amber-200 text-amber-600 flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                    <FolderKanban className="w-6 h-6" />
                  </div>
                </div>

                  <div>
                    <h3
                      onClick={() => onLaunchSoftware(item)}
                      className="text-base font-bold text-slate-900 line-clamp-2 font-display leading-snug hover:text-amber-700 cursor-pointer"
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

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onViewSoftware(item)}
                      className="flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                      title="Xem nội dung ứng dụng"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Xem</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onLaunchSoftware(item)}
                      className="flex items-center gap-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      title="Mở ứng dụng tiện ích"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Mở</span>
                    </button>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                        title="Sửa ứng dụng"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteItem(item)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Xóa ứng dụng này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
          ))}
        </div>
      )}
    </section>
  );
};
