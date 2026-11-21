# Ghi chú sửa lỗi cài đặt trên Vercel

## Lỗi đã xử lý

Log báo `ERESOLVE` do dự án khai báo `esbuild@^0.25.0`, trong khi Vite 8 yêu cầu peer optional `esbuild@^0.27.0 || ^0.28.0` và phiên bản `tsx` trong lockfile sử dụng `esbuild@~0.28.0`.

Các thay đổi:
- Gỡ khai báo `esbuild@^0.25.0` trực tiếp khỏi `devDependencies` để không ép npm chọn phiên bản xung đột.
- Giữ bản `esbuild@0.28.2` mà `tsx` đã khóa trong `package-lock.json`.
- Khai báo Node.js `>=22.12.0`, phù hợp với Vite 8.

## Thiết lập Vercel

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm ci`
- Node.js Version: 22.x (ít nhất 22.12.0)

Sau khi thay mã nguồn, hãy push toàn bộ thư mục lên GitHub và tạo deployment mới trên Vercel. Không dùng `--force` hoặc `--legacy-peer-deps` để che lỗi peer dependency.

## Phạm vi xác nhận

Bản này xử lý xung đột dependency được thể hiện trong ảnh log. Chưa thể khẳng định toàn bộ API/backend và các chức năng nghiệp vụ đã hoạt động trên Vercel nếu chưa có log build mới, cấu hình biến môi trường và kiểm thử sau triển khai.

## Sửa bổ sung theo log build mới

Vite 8 gọi `transformWithEsbuild` và yêu cầu package `esbuild` có thể được resolve từ chính thư mục `node_modules` gốc. Chỉ giữ esbuild lồng bên trong `tsx` không đủ. Vì vậy đã thêm lại `esbuild@^0.28.2` vào `devDependencies` (không phải bản 0.25.x), đồng thời khai báo package tương ứng trong lockfile và gói binary `@esbuild/linux-x64` để Vercel Linux có thể cài đặt.
