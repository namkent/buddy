# MES Buddy - Nền tảng Hỗ trợ Sản xuất Thông minh

MES Buddy là một ứng dụng hỗ trợ vận hành sản xuất tích hợp AI (RAG), cho phép truy xuất tri thức doanh nghiệp và giám sát hệ thống thời gian thực.

---

## 1. Hướng dẫn Kỹ thuật (Technical Setup)

### 1.1 Yêu cầu hệ thống (Prerequisites)
- **Node.js**: v20.x trở lên (Yêu cầu cho LanceDB & TSX).
- **Package Manager**: `pnpm`.
- **Database**: PostgreSQL v14+.

### 1.2 Cấu hình môi trường (.env)
1. Sao chép tệp mẫu:
   ```bash
   cp .env.example .env
   ```
2. Mở tệp `.env` vừa tạo và điền các thông số cần thiết:
   - **AI Keys**: Khóa API từ Groq hoặc OpenAI.
   - **AI_SERVICE_URL**: Trỏ đến `http://localhost:3005/v1` (Dịch vụ AI nội bộ).
   - **Database**: Thông tin đăng nhập PostgreSQL.

---

### 1.3 Cài đặt và Khởi chạy
1. **Cài đặt dependencies**:
   ```bash
   pnpm install
   ```
2. **Khởi tạo Database**:
   ```bash
   pnpm run db:init
   ```
3. **Chạy hệ thống**:
   Sử dụng chế độ chạy song song cả Next.js và AI Service:
   ```bash
   pnpm dev
   ```

---

## 2. Kiến trúc AI Hiện đại

Hệ thống đã được nâng cấp từ kiến trúc Python cũ sang mô hình **Unified Node.js AI Stack**:

- **AI Service (TypeScript)**: Một dịch vụ độc lập xử lý toàn bộ logic AI (Embeddings, Reranking, STT, TTS).
- **LanceDB Integration**: Sử dụng cơ sở dữ liệu vector nhúng để thực hiện RAG ngay trong Node.js, không còn phụ thuộc vào `pgvector` hay các DB vector cồng kềnh bên ngoài.
- **Mem0 (Long-term Memory)**: Tự động ghi nhớ các sự kiện quan trọng của người dùng vào bộ nhớ dài hạn cục bộ.

---

## 3. Cấu trúc Dự án (Project Structure)
- `/app`: Giao diện Admin và Chat (Next.js).
- `/ai-service`: **Dịch vụ AI lõi (TypeScript)**. Chứa logic xử lý vector, RAG và bộ nhớ dài hạn.
- `/lib`: Các hàm tiện ích, database adapter và logic memory phía client.
- `/external_storage`: Lưu trữ tệp tin gốc của Knowledge Base.

---
*Cập nhật lần cuối: 27/04/2026*
