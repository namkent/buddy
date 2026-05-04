# Hướng dẫn cài đặt Sharp Offline

Thư mục này chứa toàn bộ các gói (tarballs) cần thiết để cài đặt thư viện `sharp` (v0.34.5) cho môi trường không có kết nối internet. Hỗ trợ Windows x64, Linux x64 (glibc & musl) và Linux ARM64.

## 📋 Yêu cầu
- Máy mục tiêu đã cài đặt **Node.js** và **npm**.
- Bạn đang đứng tại thư mục gốc của dự án (nơi có file `package.json`).

## 🚀 Cách cài đặt (Khuyên dùng)

Sử dụng script cài đặt tự động đi kèm để tự nhận diện hệ điều hành và cài đúng bản binary:

```bash
node "đường/dẫn/đến/sharp-offline/install-offline.js"
```

*Lưu ý: Bạn phải chạy lệnh này từ thư mục dự án của bạn.*

---

## 🛠 Cài đặt thủ công (Nếu script lỗi)

Nếu bạn không muốn dùng script, bạn có thể chạy lệnh `npm install` trực tiếp bằng cách liệt kê các file tương ứng với hệ điều hành của mình:

### Cho Windows x64:
```bash
npm install --offline "./sharp-offline/sharp-0.34.5.tgz" "./sharp-offline/img-sharp-win32-x64-0.34.5.tgz" "./sharp-offline/img-sharp-libvips-win32-x64-1.2.4.tgz" "./sharp-offline/detect-libc-2.1.2.tgz" "./sharp-offline/semver-7.7.3.tgz" "./sharp-offline/img-colour-1.0.0.tgz"
```

### Cho Linux x64 (Ubuntu, Debian, CentOS...):
```bash
npm install --offline "./sharp-offline/sharp-0.34.5.tgz" "./sharp-offline/img-sharp-linux-x64-0.34.5.tgz" "./sharp-offline/img-sharp-libvips-linux-x64-1.2.4.tgz" "./sharp-offline/detect-libc-2.1.2.tgz" "./sharp-offline/semver-7.7.3.tgz" "./sharp-offline/img-colour-1.0.0.tgz"
```

### Cho Linux ARM64 (AWS Graviton, Raspberry Pi...):
```bash
npm install --offline "./sharp-offline/sharp-0.34.5.tgz" "./sharp-offline/img-sharp-linux-arm64-0.34.5.tgz" "./sharp-offline/img-sharp-libvips-linux-arm64-1.2.4.tgz" "./sharp-offline/detect-libc-2.1.2.tgz" "./sharp-offline/semver-7.7.3.tgz" "./sharp-offline/img-colour-1.0.0.tgz"
```

---

## 📦 Danh sách các gói có trong thư mục
- `sharp-0.34.5.tgz`: Thư viện chính.
- `img-sharp-win32-x64-0.34.5.tgz`: Binary cho Windows.
- `img-sharp-linux-x64-0.34.5.tgz`: Binary cho Linux (glibc).
- `img-sharp-linuxmusl-x64-0.34.5.tgz`: Binary cho Linux (Alpine/musl).
- `img-sharp-linux-arm64-0.34.5.tgz`: Binary cho Linux ARM64.
- `img-sharp-libvips-*.tgz`: Các thư viện libvips tương ứng.
- `detect-libc-2.1.2.tgz`, `semver-7.7.3.tgz`, `img-colour-1.0.0.tgz`: Các phụ thuộc bắt buộc.

---
*Người tạo: Antigravity AI*
