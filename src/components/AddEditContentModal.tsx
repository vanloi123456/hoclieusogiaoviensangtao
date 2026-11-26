import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Cpu,
  Gamepad2,
  FlaskConical,
  AlertCircle,
  Eye,
  Check,
  FolderKanban,
  PlayCircle,
  ExternalLink,
  Code2,
  Globe,
  Cloud,
  CloudOff,
  Box,
  Coins,
} from 'lucide-react';
import {
  ContentItem,
  ContentType,
  ZoneType,
  CREDIT_COST_STANDARD_ACCESS,
  MAX_CUSTOM_CREDIT_COST,
} from '../types';
import {
  classifyAppSource,
  generateSandboxHtml,
  getUtf8ByteLength,
  validateAndFormatEmbed,
} from '../utils/embed';

interface AddEditContentModalProps {
  isOpen: boolean;
  defaultZone: ZoneType;
  editingItem: ContentItem | null;
  isCloudConnected?: boolean;
  onSave: (item: Partial<ContentItem>) => Promise<void>;
  onClose: () => void;
}

export const AddEditContentModal: React.FC<AddEditContentModalProps> = ({
  isOpen,
  defaultZone,
  editingItem,
  isCloudConnected = false,
  onSave,
  onClose,
}) => {
  const [zone, setZone] = useState<ZoneType>(defaultZone);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [embedCode, setEmbedCode] = useState('');
  const [creditCost, setCreditCost] = useState<number>(CREDIT_COST_STANDARD_ACCESS);

  // UI states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [embedValidation, setEmbedValidation] = useState<{
    isValid: boolean;
    message?: string;
  }>({ isValid: true });
  const [formError, setFormError] = useState<string | null>(null);
  const [showEmbedPreview, setShowEmbedPreview] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setZone(editingItem.zone);
      setTitle(editingItem.title || '');
      setDescription(editingItem.description || '');
      setEmbedCode(editingItem.embedCode || '');
      setCreditCost(
        typeof editingItem.creditCost === 'number' && Number.isFinite(editingItem.creditCost)
          ? Math.max(0, Math.min(MAX_CUSTOM_CREDIT_COST, Math.floor(editingItem.creditCost)))
          : editingItem.zone === 'management'
          ? 0
          : CREDIT_COST_STANDARD_ACCESS
      );
    } else {
      const allowedNewZone: ZoneType =
        defaultZone === 'management' || defaultZone === 'guides' ? defaultZone : 'guides';
      setZone(allowedNewZone);
      setTitle('');
      setDescription('');
      setEmbedCode('');
      setCreditCost(allowedNewZone === 'management' ? CREDIT_COST_STANDARD_ACCESS : 0);
    }
    setEmbedValidation({ isValid: true });
    setFormError(null);
    setShowEmbedPreview(false);
  }, [editingItem, defaultZone, isOpen]);

  const sourceInfo = useMemo(() => classifyAppSource(embedCode), [embedCode]);

  if (!isOpen) return null;

  const handleEmbedChange = (code: string) => {
    setEmbedCode(code);
    setFormError(null);
    if (code.trim()) {
      const result = validateAndFormatEmbed(code);
      setEmbedValidation({
        isValid: result.isValid,
        message: result.errorMessage,
      });
    } else {
      setEmbedValidation({ isValid: true });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!editingItem) {
      setFormError('Chức năng thêm mới nội dung hiện đang được tắt.');
      return;
    }

    if (zone === 'management') {
      if (
        !Number.isFinite(creditCost) ||
        creditCost < 0 ||
        creditCost > MAX_CUSTOM_CREDIT_COST
      ) {
        setFormError('Giá tín dụng AI của ứng dụng phải nằm trong khoảng 0 - 100.000.');
        return;
      }
    }

    if (!title.trim()) {
      setFormError('Vui lòng nhập tiêu đề nội dung.');
      return;
    }

    if (!embedCode.trim()) {
      setFormError(
        zone === 'guides'
          ? 'Vui lòng dán đường dẫn video YouTube hoặc mã nhúng HTML / <iframe>.'
          : 'Vui lòng dán mã nhúng HTML hoặc đường dẫn Google Gemini, Google AI Studio, Vercel.'
      );
      return;
    }

    const val = validateAndFormatEmbed(embedCode);
    if (!val.isValid) {
      setEmbedValidation({ isValid: false, message: val.errorMessage });
      setFormError(val.errorMessage || 'Mã nhúng hoặc liên kết không hợp lệ.');
      return;
    }

    const normalizedEmbed =
      val.type === 'url' && val.srcUrl ? val.srcUrl : embedCode.trim();

    let contentType: ContentType = 'app';
    if (zone === 'virtual_spaces') contentType = 'virtual_space';
    if (zone === 'games') contentType = 'game';
    if (zone === 'simulations') contentType = 'simulation';
    if (zone === 'management') contentType = 'management';
    if (zone === 'guides') contentType = 'guide';

    setIsSubmitting(true);
    try {
      await onSave({
        zone,
        title: title.trim(),
        description: description.trim(),
        type: contentType,
        embedCode: normalizedEmbed,
        creditCost:
          zone === 'management'
            ? Math.max(0, Math.min(MAX_CUSTOM_CREDIT_COST, Math.floor(creditCost)))
            : undefined,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      let msg = 'Có lỗi xảy ra khi lưu nội dung lên hệ thống. Vui lòng thử lại.';
      if (err instanceof Error && err.message) {
        if (err.message.includes('insufficient permissions')) {
          msg =
            'Tài khoản hiện tại chưa được cấp quyền ghi lên Cloud Firestore. Vui lòng đăng nhập Google bằng tài khoản Quản trị (vanloiphuhiep.09@gmail.com).';
        } else if (!err.message.startsWith('{')) {
          msg = err.message;
        }
      }
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-sky-100 overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-sky-50 via-cyan-50/50 to-white border-b border-sky-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
              {zone === 'virtual_spaces' && <Box className="w-5 h-5" />}
              {zone === 'apps' && <Cpu className="w-5 h-5" />}
              {zone === 'games' && <Gamepad2 className="w-5 h-5" />}
              {zone === 'simulations' && <FlaskConical className="w-5 h-5" />}
              {zone === 'management' && <FolderKanban className="w-5 h-5" />}
              {zone === 'guides' && <PlayCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-display">
                {editingItem ? 'Chỉnh sửa nội dung' : 'Thêm mới nội dung'}
              </h2>
              <p className="text-xs text-sky-700">
                Học liệu số – Giáo viên sáng tạo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          {/* Zone Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Khu vực học liệu
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!editingItem}
                onClick={() => editingItem && setZone('virtual_spaces')}
                title={!editingItem ? 'Chức năng thêm mới tại khu vực này đang tạm tắt' : undefined}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  !editingItem
                    ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                    : zone === 'virtual_spaces'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs cursor-pointer'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 cursor-pointer'
                }`}
              >
                <Box className="w-4 h-4 shrink-0" />
                <span className="truncate">Không gian ảo 3D</span>
              </button>

              <button
                type="button"
                disabled={!editingItem}
                onClick={() => editingItem && setZone('apps')}
                title={!editingItem ? 'Chức năng thêm mới tại khu vực này đang tạm tắt' : undefined}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  !editingItem
                    ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                    : zone === 'apps'
                    ? 'bg-sky-600 text-white border-sky-700 shadow-xs cursor-pointer'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 cursor-pointer'
                }`}
              >
                <Cpu className="w-4 h-4 shrink-0" />
                <span className="truncate">Kho Ứng Dụng (AI)</span>
              </button>

              <button
                type="button"
                disabled={!editingItem}
                onClick={() => editingItem && setZone('games')}
                title={!editingItem ? 'Chức năng thêm mới tại khu vực này đang tạm tắt' : undefined}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  !editingItem
                    ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                    : zone === 'games'
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs cursor-pointer'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 cursor-pointer'
                }`}
              >
                <Gamepad2 className="w-4 h-4 shrink-0" />
                <span className="truncate">Học Liệu Số</span>
              </button>

              <button
                type="button"
                disabled={!editingItem}
                onClick={() => editingItem && setZone('simulations')}
                title={!editingItem ? 'Chức năng thêm mới tại khu vực này đang tạm tắt' : undefined}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  !editingItem
                    ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                    : zone === 'simulations'
                    ? 'bg-teal-600 text-white border-teal-700 shadow-xs cursor-pointer'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 cursor-pointer'
                }`}
              >
                <FlaskConical className="w-4 h-4 shrink-0" />
                <span className="truncate">Thí Nghiệm Mô Phỏng</span>
              </button>

              <button
                type="button"
                disabled={!editingItem}
                onClick={() => {
                  if (!editingItem) return;
                  setZone('management');
                }}
                title={!editingItem ? 'Chức năng thêm mới tại khu vực này đang tạm tắt' : undefined}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  !editingItem
                    ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                    : zone === 'management'
                    ? 'bg-amber-600 text-white border-amber-700 shadow-xs cursor-pointer'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 cursor-pointer'
                }`}
              >
                <FolderKanban className="w-4 h-4 shrink-0" />
                <span className="truncate">Ứng dụng Tiện ích</span>
              </button>

              <button
                type="button"
                disabled={!editingItem}
                onClick={() => editingItem && setZone('guides')}
                title={!editingItem ? 'Chức năng thêm mới tại khu vực này đang tạm tắt' : undefined}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  !editingItem
                    ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                    : zone === 'guides'
                    ? 'bg-rose-600 text-white border-rose-700 shadow-xs cursor-pointer'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 cursor-pointer'
                }`}
              >
                <PlayCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">Hướng dẫn</span>
              </button>
            </div>
          </div>

          {/* Title Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Tiêu đề{' '}
              {zone === 'virtual_spaces'
                ? 'Không gian ảo 3D'
                : zone === 'apps'
                ? 'Ứng dụng'
                : zone === 'games'
                ? 'Học liệu số'
                : zone === 'simulations'
                ? 'Thí nghiệm'
                : zone === 'management'
                ? 'Ứng dụng tiện ích'
                : 'Hướng dẫn'}{' '}
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tiêu đề..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Mô tả / Hướng dẫn hoạt động (tùy chọn)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nhập mô tả hoặc hướng dẫn..."
              rows={2}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 resize-none"
            />
          </div>

          {/* Per-item Custom Credit Cost for Ứng dụng Tiện ích */}
          {zone === 'management' && (
            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs font-bold text-amber-950 uppercase tracking-wider">
                  <Coins className="w-4 h-4 text-amber-600" />
                  <span>Cài đặt giá truy cập riêng (Tín dụng AI)</span>
                </label>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white border border-amber-200 text-amber-800">
                  {creditCost === 0 ? 'Miễn phí (0 tín dụng AI)' : `Trừ ${creditCost} tín dụng AI / lượt`}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <input
                  type="number"
                  min={0}
                  max={MAX_CUSTOM_CREDIT_COST}
                  step={1}
                  value={creditCost}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCreditCost(Number.isFinite(val) ? Math.max(0, Math.floor(val)) : 0);
                  }}
                  className="w-full sm:w-40 px-3.5 py-2 rounded-xl border border-amber-300 bg-white text-slate-900 text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[0, 2, 4, 5, 10, 20].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCreditCost(preset)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        creditCost === preset
                          ? 'bg-amber-600 text-white border-amber-700'
                          : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      {preset === 0 ? 'Miễn phí (0)' : `${preset}`}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-amber-900/80 leading-relaxed">
                Mỗi ứng dụng trong khu vực <strong>Ứng dụng Tiện ích</strong> có mức giá tín dụng AI riêng khi giáo viên truy cập (đặt <strong>0</strong> để miễn phí).
              </p>
            </div>
          )}

          {/* Embed Code / Platform Link */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                {zone === 'guides'
                  ? 'Link video YouTube hoặc mã nhúng HTML / <iframe>'
                  : 'Mã nhúng HTML hoặc Link Google Gemini / Google AI Studio / Vercel'}{' '}
                <span className="text-rose-500">*</span>
              </label>

              <div className="flex items-center gap-2">
                {embedCode.trim() && embedValidation.isValid && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                    {sourceInfo.kind === 'html' || sourceInfo.kind === 'iframe' ? (
                      <Code2 className="w-3 h-3" />
                    ) : (
                      <Globe className="w-3 h-3" />
                    )}
                    <span>{sourceInfo.label}</span>
                  </span>
                )}
                {embedCode && embedValidation.isValid && !sourceInfo.iframeBlockedLikely && (
                  <button
                    type="button"
                    onClick={() => setShowEmbedPreview(!showEmbedPreview)}
                    className="text-xs text-sky-600 hover:text-sky-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{showEmbedPreview ? 'Ẩn xem trước' : 'Xem trước'}</span>
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={embedCode}
              onChange={(e) => handleEmbedChange(e.target.value)}
              placeholder={
                zone === 'guides'
                  ? 'Dán đường dẫn video YouTube (vd: https://www.youtube.com/watch?v=...) hoặc mã nhúng <iframe> / HTML...'
                  : 'Dán mã nhúng HTML (<!DOCTYPE html>...), thẻ <iframe> hoặc link https://... từ Google Gemini (gemini.google.com), Google AI Studio (aistudio.google.com / ai.studio / *.run.app), Vercel (https://...vercel.app)...'
              }
              rows={5}
              className={`w-full px-4 py-2.5 rounded-xl border font-mono text-xs focus:outline-hidden focus:ring-2 transition-all ${
                embedValidation.isValid
                  ? 'border-slate-200 focus:ring-sky-500 bg-slate-900 text-sky-300'
                  : 'border-rose-300 focus:ring-rose-500 bg-rose-50/30 text-rose-900'
              }`}
              required
            />

            {zone !== 'guides' && (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Hỗ trợ chạy trực tiếp trong khung với mã nhúng{' '}
                <span className="font-semibold text-slate-700">HTML / &lt;iframe&gt;</span> (lên tới 4,5 MB), link{' '}
                <span className="font-semibold text-slate-700">Vercel (*.vercel.app)</span> và link{' '}
                <span className="font-semibold text-slate-700">Google AI Studio App (*.run.app)</span>.
                Với link chia sẻ trực tiếp <span className="font-semibold text-slate-700">gemini.google.com</span> hoặc{' '}
                <span className="font-semibold text-slate-700">aistudio.google.com / ai.studio</span>, hệ thống sẽ cung cấp nút mở nội dung trong tab mới.
              </p>
            )}

            {embedCode.trim() && (sourceInfo.kind === 'html' || sourceInfo.kind === 'iframe') && (
              <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                <span>
                  Dung lượng mã nhúng:{' '}
                  <strong className="text-slate-800">
                    {(getUtf8ByteLength(embedCode.trim()) / 1024).toFixed(1)} KB
                  </strong>
                  {getUtf8ByteLength(embedCode.trim()) > 450_000
                    ? ' (Tự động chia mảnh để lưu vĩnh viễn trên Cloud Firestore)'
                    : ' (Lưu vĩnh viễn trên Cloud Firestore)'}
                </span>
              </div>
            )}

            {embedValidation.isValid && sourceInfo.iframeBlockedLikely && sourceInfo.url && (
              <div className="flex items-start gap-2 text-xs text-sky-900 bg-sky-50 p-2.5 rounded-xl border border-sky-200">
                <ExternalLink className="w-4 h-4 shrink-0 text-sky-600 mt-0.5" />
                <span>
                  Đã nhận diện liên kết <strong>{sourceInfo.label}</strong>. Do chính sách bảo mật của Google không cho phép nhúng trực tiếp vào iframe, khi giáo viên mở nội dung, hệ thống sẽ hiển thị nút mở trực tiếp sang tab mới.
                </span>
              </div>
            )}

            {!embedValidation.isValid && embedValidation.message && (
              <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{embedValidation.message}</span>
              </div>
            )}

            {showEmbedPreview && embedValidation.isValid && embedCode && !sourceInfo.iframeBlockedLikely && (
              <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800">
                <p className="text-xs text-slate-400 mb-2">Xem trước trong Sandbox an toàn:</p>
                <div className="aspect-video w-full bg-white rounded-xl overflow-hidden">
                  <iframe
                    srcDoc={generateSandboxHtml(embedCode)}
                    title="Xem trước"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                    allow="accelerometer; autoplay; camera; clipboard-write; encrypted-media; gyroscope; microphone; picture-in-picture; fullscreen"
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cloud persistence indicator */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-medium ${
              isCloudConnected
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {isCloudConnected ? (
              <>
                <Cloud className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>
                  Đang kết nối Đám mây — nội dung &amp; mã nhúng sẽ được lưu vĩnh viễn, xem được trên mọi máy tính và trình duyệt.
                </span>
              </>
            ) : (
              <>
                <CloudOff className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Đang ở chế độ Quản trị cục bộ — nội dung sẽ lưu vào hàng đợi và cần nhấn &ldquo;Kết nối Google Đám mây&rdquo; ở thanh trên cùng để đồng bộ sang mọi máy tính, trình duyệt khác.
                </span>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 active:scale-98 rounded-xl transition-all shadow-md shadow-sky-600/20 flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang lưu...' : 'Xác nhận lưu'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
