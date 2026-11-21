import React, { useRef } from 'react';
import {
  PlayCircle,
  Play,
  Trash2,
  Edit3,
  Camera,
  RotateCcw,
  Eye,
  Plus,
  Youtube,
  Code2,
} from 'lucide-react';
import { ContentItem, UserRole, UserAccount } from '../types';
import { extractYouTubeVideoId, generateSandboxHtml } from '../utils/embed';
import { processImageFile } from '../utils/image';

interface ZoneGuidesProps {
  items: ContentItem[];
  role: UserRole;
  currentUser?: UserAccount | null;
  avatarUrl?: string;
  onUploadAvatar?: (dataUrl: string) => void;
  onRemoveAvatar?: () => void;
  onSelectZone?: () => void;
  onAddGuide?: () => void;
  onEditItem: (item: ContentItem) => void;
  onDeleteItem: (item: ContentItem) => void;
  onViewGuide: (item: ContentItem) => void;
  onLaunchGuide: (item: ContentItem) => void;
}

export const ZoneGuides: React.FC<ZoneGuidesProps> = ({
  items,
  role,
  avatarUrl,
  onUploadAvatar,
  onRemoveAvatar,
  onSelectZone,
  onAddGuide,
  onEditItem,
  onDeleteItem,
  onViewGuide,
  onLaunchGuide,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canManage = role === 'admin';
  const isAdmin = role === 'admin';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadAvatar) return;
    try {
      const dataUrl = await processImageFile(file, 600);
      onUploadAvatar(dataUrl);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi xử lý hình ảnh');
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
              Hướng dẫn sử dụng — Hỗ trợ chèn mã nhúng HTML/iframe hoặc link video trên YouTube
            </p>

            {/* Admin dedicated avatar & quick add toolbar */}
            {isAdmin && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {onAddGuide && (
                  <button
                    type="button"
                    onClick={onAddGuide}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                    title="Thêm hướng dẫn sử dụng mới (link YouTube hoặc mã nhúng)"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm hướng dẫn</span>
                  </button>
                )}
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
            Khu vực hướng dẫn sử dụng đang trống
          </h3>
          <p className="text-xs text-slate-600 max-w-md mb-4 leading-relaxed">
            Chưa có video hoặc tài liệu hướng dẫn nào. Quản trị viên có thể thêm hướng dẫn bằng đường dẫn YouTube hoặc mã nhúng HTML/iframe.
          </p>
          {isAdmin && onAddGuide && (
            <button
              type="button"
              onClick={onAddGuide}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm hướng dẫn ngay</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => {
            const youtubeId = item.embedCode ? extractYouTubeVideoId(item.embedCode) : null;
            const previewDoc = !youtubeId && item.embedCode ? generateSandboxHtml(item.embedCode) : '';

            return (
              <div
                key={item.id}
                className="group bg-white/95 backdrop-blur-sm rounded-2xl border border-rose-100/90 hover:border-rose-300 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
              >
                {/* Guide Preview Window */}
                <div className="relative aspect-16/10 bg-slate-950 overflow-hidden">
                  {youtubeId ? (
                    <img
                      src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-cover opacity-90 group-hover:scale-105 group-hover:opacity-100 transition-all duration-300"
                    />
                  ) : item.embedCode ? (
                    <div className="w-full h-full relative pointer-events-none opacity-85 group-hover:opacity-100 transition-opacity">
                      <iframe
                        srcDoc={previewDoc}
                        title={item.title}
                        sandbox="allow-scripts allow-same-origin"
                        className="w-full h-full border-0 transform scale-90 origin-center"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <PlayCircle className="w-12 h-12" />
                    </div>
                  )}

                  {/* Source Format Pill */}
                  <div className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-950/75 text-white border border-white/15 backdrop-blur-xs">
                    {youtubeId ? (
                      <>
                        <Youtube className="w-3 h-3 text-rose-400" />
                        <span>Video YouTube</span>
                      </>
                    ) : (
                      <>
                        <Code2 className="w-3 h-3 text-sky-400" />
                        <span>Mã nhúng</span>
                      </>
                    )}
                  </div>

                  {/* Play Action Overlay */}
                  <div
                    onClick={() => onLaunchGuide(item)}
                    className="absolute inset-0 bg-slate-950/25 hover:bg-slate-950/10 transition-colors flex items-center justify-center cursor-pointer group/btn"
                  >
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 group-hover/btn:bg-rose-500 text-white font-bold text-xs shadow-lg group-hover/btn:scale-105 transition-all">
                      <Play className="w-4 h-4 fill-current" />
                      <span>Xem hướng dẫn</span>
                    </div>
                  </div>
                </div>

                {/* Guide Meta & Controls */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3
                      onClick={() => onLaunchGuide(item)}
                      className="text-base font-bold text-slate-800 line-clamp-1 hover:text-rose-600 cursor-pointer font-display"
                      title={item.title}
                    >
                      {item.title}
                    </h3>
                    {item.description ? (
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                        {item.description}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic mt-1">
                        Video / tài liệu hướng dẫn sử dụng hệ thống học liệu số
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onViewGuide(item)}
                        className="flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                        title="Xem chi tiết hướng dẫn"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Xem</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onLaunchGuide(item)}
                        className="flex items-center gap-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        title="Mở hướng dẫn toàn màn hình"
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
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Sửa hướng dẫn"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteItem(item)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Xóa hướng dẫn này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
