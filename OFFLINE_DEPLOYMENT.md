# Hướng dẫn Đóng gói và Triển khai Offline (MES Assistant)

Tài liệu này hướng dẫn cách đóng gói toàn bộ dự án, bao gồm mã nguồn, thư viện (node_modules), các file binaries (sharp, onnxruntime) và các AI models để triển khai trên máy tính không có kết nối Internet.

---

## 1. Chuẩn bị (Trên máy tính CÓ Internet)

Trước khi đóng gói, hãy đảm bảo bạn đã cấu hình đầy đủ các model cần thiết trong file `.env` của `ai-service`.

### Bước 1: Chạy lệnh đóng gói
Mở terminal tại thư mục gốc của dự án và chạy:
```bash
npm run offline:pack
```

### Bước 2: Kết quả
Sau khi lệnh chạy xong, bạn sẽ thấy:
- Một file `mes-assistant-offline.zip` được tạo ra ở thư mục gốc.
- Thư mục `.pnpm-store` và `.pnpm-cache` chứa toàn bộ thư viện và binaries.
- Thư mục `bundled-models` chứa các AI models đã được tải về.

---

## 2. Triển khai (Trên máy tính KHÔNG có Internet)

### Bước 1: Giải nén
Copy file `mes-assistant-offline.zip` sang máy offline và giải nén vào thư mục làm việc.

### Bước 2: Khôi phục môi trường
Mở terminal tại thư mục vừa giải nén và chạy lệnh:
```bash
npm run offline:unpack
```
**Lưu ý:** Máy offline cần cài sẵn **Node.js** và **pnpm** (hoặc sử dụng `npx pnpm` nếu có Node.js).

### Bước 3: Khởi tạo Database
Nếu đây là lần đầu triển khai, hãy khởi tạo lại cơ sở dữ liệu:
```bash
npm run db:reset
```
*(Lệnh này sẽ tạo lại toàn bộ bảng, tạo user admin mặc định `admin@sdv.mes` / `123456` và xóa sạch dữ liệu cũ).*

### Bước 4: Khởi động ứng dụng
Chạy ứng dụng bằng lệnh:
```bash
npm run dev
```

---

## 3. Giải quyết sự cố thường gặp

### Lỗi thư viện Sharp (Chỉ trên Windows)
Thư viện `sharp` đôi khi không nhận diện được binaries build sẵn trong môi trường offline đặc thù. Nếu `ai-service` báo lỗi liên quan đến sharp:
1. Tìm file `install/install_sharp.zip` trong dự án.
2. Giải nén toàn bộ nội dung trong file đó vào thư mục: `ai-service/node_modules/sharp/vendor`.

### AI Models không load được
Nếu ứng dụng báo lỗi không tìm thấy model:
1. Kiểm tra lại đường dẫn `STORAGE_DIR` trong file `.env` của `ai-service`.
2. Đảm bảo các file trong thư mục `bundled-models` đã được script unpack copy vào đúng thư mục `storage/models`.

---
*Người viết: Antigravity AI Assistant*
