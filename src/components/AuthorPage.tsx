import React from 'react';
import {
  ArrowLeft,
  Home,
  User,
  Briefcase,
  Building2,
  MapPin,
  Phone,
  GraduationCap,
} from 'lucide-react';

interface AuthorPageProps {
  onBackHome: () => void;
}

export const AuthorPage: React.FC<AuthorPageProps> = ({ onBackHome }) => {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-50/95 via-white to-emerald-50/90 shadow-sm">
      {/* Subtle decorative radial atmospheric washes */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.10),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.10),transparent_58%)]"
        aria-hidden="true"
      />

      <div className="relative z-10 px-6 py-7 sm:px-12 sm:py-10 md:px-14 md:py-12 max-w-4xl mx-auto space-y-8">
        {/* Top Action: Trở lại Trang chủ */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/95 hover:bg-sky-50 text-sky-800 border border-sky-200 shadow-2xs text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-sky-600" />
            <span>Trở lại Trang chủ</span>
          </button>

          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800">
            <User className="w-4 h-4 text-sky-600" />
            <span>Về Tác giả</span>
          </div>
        </div>

        {/* Centered Profile Header */}
        <header className="text-center space-y-2.5 pb-7 border-b border-sky-200/75">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-600 to-teal-600 text-white flex items-center justify-center mx-auto shadow-sm">
            <GraduationCap className="w-7 h-7" />
          </div>
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-sky-700 pt-1">
            Tác giả Website
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold font-display tracking-tight text-sky-950 leading-tight text-balance">
            Đào Văn Lợi
          </h2>
        </header>

        {/* Balanced 2-Column Editorial Details (Aligned Labels & Values) */}
        <div className="grid grid-cols-1 md:grid-cols-[1.35fr_0.9fr] gap-8 md:gap-10 py-2">
          {/* Column 1: Thông tin công tác */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Thông tin công tác
            </h3>

            <div className="divide-y divide-sky-200/60">
              <div className="flex items-start gap-3.5 py-3.5 first:pt-1">
                <div className="w-9 h-9 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[76px_1fr] sm:items-baseline gap-0.5 sm:gap-3 pt-1">
                  <span className="text-xs sm:text-sm font-medium text-slate-500">Chức vụ</span>
                  <span className="text-sm sm:text-base font-bold text-emerald-800 leading-snug">
                    Phó Hiệu trưởng
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3.5 py-3.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100/80 text-sky-700 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[76px_1fr] sm:items-baseline gap-0.5 sm:gap-3 pt-1">
                  <span className="text-xs sm:text-sm font-medium text-slate-500">Đơn vị</span>
                  <span className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    Trường Tiểu học và Trung học cơ sở Tân Khánh Trung
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3.5 py-3.5 last:pb-0">
                <div className="w-9 h-9 rounded-xl bg-teal-100/80 text-teal-700 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[76px_1fr] sm:items-baseline gap-0.5 sm:gap-3 pt-1">
                  <span className="text-xs sm:text-sm font-medium text-slate-500">Địa chỉ</span>
                  <span className="text-sm sm:text-base font-semibold text-slate-800 leading-snug">
                    ấp Hưng Hòa, xã Tân Khánh Trung, tỉnh Đồng Tháp
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Thông tin liên hệ */}
          <div className="space-y-4 md:pl-10 md:border-l md:border-sky-200/75 pt-6 border-t border-sky-200/75 md:pt-0 md:border-t-0 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Thông tin liên hệ
              </h3>

              <div className="flex items-start gap-3.5 pt-1">
                <div className="w-9 h-9 rounded-xl bg-amber-100/80 text-amber-700 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-slate-500">Điện thoại</p>
                  <p className="text-xl sm:text-2xl font-bold text-rose-600 tabular-nums tracking-tight">
                    0775987267
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <a
                href="tel:0775987267"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-2xs transition-colors whitespace-nowrap shrink-0"
              >
                <Phone className="w-4 h-4" />
                <span>Gọi điện liên hệ</span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Action: Trở lại Trang chủ */}
        <div className="pt-6 border-t border-sky-200/75 flex justify-center">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:scale-[0.99] text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Home className="w-4 h-4" />
            <span>Trở lại Trang chủ</span>
          </button>
        </div>
      </div>
    </article>
  );
};
