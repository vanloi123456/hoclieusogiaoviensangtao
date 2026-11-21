import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="fixed bottom-0 inset-x-0 md:left-72 z-30 bg-gradient-to-r from-sky-100/80 via-cyan-50/90 to-teal-100/75 backdrop-blur-xl border-t border-sky-200/80 py-2.5 px-4 sm:px-6 text-center shadow-xs">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5 text-xs sm:text-sm text-slate-700">
        <div className="font-bold text-sky-900 font-display tracking-wide">
          Học liệu số - Giáo viên sáng tạo
        </div>
        <div className="text-slate-600 font-medium">
          Tác giả:{' '}
          <span className="font-bold text-slate-900">
            Đào Văn Lợi – PHT Trường TH&THCS Tân Khánh Trung, tỉnh Đồng Tháp
          </span>
        </div>
      </div>
    </footer>
  );
};
