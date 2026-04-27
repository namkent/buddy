# MES AI Service (TypeScript)

Dịch vụ AI tập trung cho hệ thống MES Assistant. Cung cấp các khả năng xử lý ngôn ngữ tự nhiên, âm thanh và tài liệu thông qua mô hình Transformers.js (chạy cục bộ) và cơ sở dữ liệu vector LanceDB.

## 1. Tính năng chính

- **Embeddings**: Chuyển đổi văn bản thành vector (mặc định: `all-MiniLM-L6-v2`).
- **Reranking**: Xếp hạng lại kết quả tìm kiếm để tăng độ chính xác (mặc định: `ms-marco-MiniLM-L-6-v2`).
- **RAG (Knowledge Base)**: Hệ thống lưu trữ và tìm kiếm vector sử dụng **LanceDB** (không cần pgvector).
- **Long-term Memory**: Bộ nhớ dài hạn cho người dùng (Mem0 style) lưu trữ tại chỗ.
- **Speech-to-Text (STT)**: Chuyển đổi giọng nói thành văn bản.
- **Text-to-Speech (TTS)**: Chuyển đổi văn bản thành âm thanh.

## 2. Kiến trúc & Công nghệ

- **TypeScript**: Toàn bộ dự án đã được chuyển đổi sang TS để tăng độ ổn định và an toàn kiểu dữ liệu.
- **LanceDB**: Sử dụng cơ sở dữ liệu vector nhúng (embedded) dạng file, giúp tách biệt hoàn toàn dữ liệu AI khỏi database nghiệp vụ chính.
- **Transformers.js**: Chạy các mô hình AI trực tiếp trên Node.js (CPU/GPU) mà không cần API bên ngoài.
- **Xử lý lỗi & Log**: Middleware tập trung xử lý ngoại lệ và hệ thống log màu sắc giúp dễ dàng giám sát.

## 3. Hướng dẫn sử dụng

### Cài đặt
```bash
cd ai-service
pnpm install
```

### Chạy dịch vụ
```bash
pnpm dev
```
Dịch vụ chạy tại: `http://localhost:3005` (Swagger: `/api-docs`)

### Tải trước các mô hình
Để tránh trễ trong lần chạy đầu tiên, bạn có thể tải trước các mô hình:
```bash
pnpm tsx utils/downloadModels.ts
```

## 4. Cấu trúc thư mục

- `/v1`: Controllers & Routes (TypeScript).
- `/utils`: AI Engines, LanceDB Helper, Document Parsers.
- `/storage`: Chứa dữ liệu vector (`vector_db/`) và các mô hình AI (`models/`).
- `/jobs`: Các tác vụ định kỳ như dọn dẹp file tạm.

---
*Cập nhật lần cuối: 27/04/2026*
