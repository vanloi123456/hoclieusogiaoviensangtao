import React from 'react';
import { ArrowLeft, Home, BookOpen } from 'lucide-react';

interface AboutPageProps {
  onBackHome: () => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onBackHome }) => {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-sky-50/95 to-cyan-50/95 shadow-sm">
      {/* Subtle decorative radial atmospheric washes */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(14,165,233,0.13),transparent_58%)]"
        aria-hidden="true"
      />

      <div className="relative z-10 px-6 py-7 sm:px-12 sm:py-10 md:px-16 md:py-12 max-w-3xl mx-auto space-y-8">
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

          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span>Giới thiệu</span>
          </div>
        </div>

        {/* Hero Title & Tagline */}
        <header className="text-center space-y-3 pb-7 border-b border-emerald-200/75">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center mx-auto shadow-sm">
            <BookOpen className="w-6 h-6" />
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold font-display tracking-tight text-emerald-950 leading-tight text-balance">
            HỌC LIỆU SỐ – GIÁO VIÊN SÁNG TẠO
          </h2>
          <p className="text-sm sm:text-base font-semibold text-sky-800 tracking-wide">
            Kết nối tri thức – Lan tỏa sáng tạo – Đổi mới giáo dục
          </p>
        </header>

        {/* Editorial Body: Canh đều 2 bên lề & thụt đầu dòng từng đoạn văn */}
        <div className="space-y-4 sm:space-y-5 text-[15px] sm:text-base text-slate-700 leading-[1.85]">
          <p className="text-justify indent-8 sm:indent-10 font-bold text-sky-950">
            Chào mừng quý thầy cô đến với HỌC LIỆU SỐ – GIÁO VIÊN SÁNG TẠO!
          </p>

          <p className="text-justify indent-8 sm:indent-10">
            Trong thời đại chuyển đổi số, công nghệ đang mở ra nhiều cơ hội mới cho hoạt động dạy và học. Việc ứng dụng công nghệ thông tin, trí tuệ nhân tạo (AI) và các nền tảng giáo dục số không chỉ giúp đổi mới phương pháp giảng dạy mà còn góp phần tạo nên những giờ học sinh động, hấp dẫn và phát huy tối đa năng lực của học sinh.
          </p>

          <p className="text-justify indent-8 sm:indent-10">
            Với mong muốn đồng hành cùng quý thầy cô trên hành trình đổi mới giáo dục, HỌC LIỆU SỐ – GIÁO VIÊN SÁNG TẠO được xây dựng như một không gian học tập, chia sẻ và kết nối dành cho đội ngũ giáo viên.
          </p>

          <p className="text-justify indent-8 sm:indent-10">
            Tại đây, quý thầy cô có thể khám phá và khai thác nhiều nguồn tài nguyên giáo dục hữu ích.
          </p>

          <p className="text-justify indent-8 sm:indent-10">
            Chúng tôi tin rằng, mỗi giáo viên đều có thể trở thành một người sáng tạo trong môi trường giáo dục số. Chỉ cần một ý tưởng mới, một công cụ phù hợp và tinh thần không ngừng học hỏi, mỗi bài học sẽ trở thành một hành trình khám phá đầy thú vị đối với học sinh.
          </p>

          <p className="text-justify indent-8 sm:indent-10">
            HỌC LIỆU SỐ – GIÁO VIÊN SÁNG TẠO không chỉ là nơi chia sẻ tài nguyên mà còn là cầu nối lan tỏa tri thức, kết nối những người yêu nghề, đam mê công nghệ và tâm huyết với sự nghiệp giáo dục.
          </p>

          <div className="pt-5 border-t border-emerald-200/75 space-y-4">
            <p className="text-justify indent-8 sm:indent-10 text-slate-800 font-medium">
              Hãy cùng khám phá, trải nghiệm, sáng tạo và lan tỏa những giá trị tốt đẹp để mỗi ngày đến trường là một ngày vui, mỗi tiết học là một trải nghiệm và mỗi giáo viên là một người truyền cảm hứng!
            </p>
            <p className="text-right text-base sm:text-lg font-bold text-emerald-900 italic pt-1">
              Trân trọng chào đón quý thầy cô!
            </p>
          </div>
        </div>

        {/* Bottom Action: Trở lại Trang chủ */}
        <div className="pt-5 border-t border-emerald-200/75 flex justify-center">
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
