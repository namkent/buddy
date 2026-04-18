# MES Buddy - Nền tảng Hỗ trợ Sản xuất Thông minh

MES Buddy là một ứng dụng hỗ trợ vận hành sản xuất tích hợp AI (RAG), cho phép truy xuất tri thức doanh nghiệp và giám sát hệ thống thời gian thực.

---

## 1. Hướng dẫn Kỹ thuật (Technical Setup)

### 1.1 Yêu cầu hệ thống (Prerequisites)
- **Node.js**: v18.x trở lên.
- **Package Manager**: `pnpm` (khuyến nghị) hoặc `npm`.
- **Database**: PostgreSQL v14+.
- **Python**: v3.10+ (cho dịch vụ RAG xử lý tài liệu).

### 1.2 Cấu hình môi trường (.env)
1. Sao chép tệp mẫu:
   ```bash
   cp .env.example .env
   ```
2. Mở tệp `.env` vừa tạo và điền các thông số cần thiết:
   - **AI Keys**: Khóa API từ Google (Gemini), Groq hoặc OpenAI, và Jina AI (cho Rerank/Embeddings).
   - **Authentication**: Cấu hình NextAuth secret và Google OAuth Client ID/Secret.
   - **Database**: Thông tin đăng nhập PostgreSQL của bạn.
   - **Storage**: Đường dẫn thư mục để lưu trữ tệp (EXTERNAL_STORAGE_PATH).

Tham khảo chi tiết các biến trong tệp `.env.example`.

### 1.3 Cài đặt và Khởi chạy
1. **Cài đặt dependencies**:
   ```bash
   pnpm install
   ```
2. **Khởi tạo Database**:
   ```bash
   node init_db.js
   ```
   *(Lệnh này sẽ tạo các bảng cần thiết bao gồm users, knowledge groups, files và system logs).*
3. **Chạy chế độ Phát triển (Dev)**:
   ```bash
   pnpm dev
   ```
4. **Xây dựng bản Production**:
   ```bash
   pnpm build
   pnpm start
   ```

---

## 2. Hướng dẫn Vận hành & Quản trị (Admin Guide)

### 2.1 Hệ thống giám sát (Logs)
Nền tảng tự động ghi lại mọi hành động quản trị quan trọng.
- **Truy cập**: Mục **Logs** trên Sidebar.
- **Khắc phục sự cố**: Nhấn vào sự kiện ERROR để mở **Log Drawer**. Tại đây bạn có thể xem Stack Trace hoặc thông số kĩ thuật (JSON) để gỡ lỗi.
- **Sao chép**: Sử dụng nút biểu tượng Copy trong tiêu đề Log để lấy thông tin gửi cho đội kỹ thuật.

### 2.2 Quản trị Cơ sở tri thức (Knowledge Base)
Đây là nguồn dữ liệu chính cho AI (RAG).
- **Thêm tri thức**: Bạn có thể tải lên tệp (`.pdf`, `.docx`, `.txt`) hoặc nhập văn bản trực tiếp qua trình soạn thảo Tiptap.
- **Theo dõi RAG**:
    - **Pending/Processing**: Hệ thống đang xử lý tách nội dung và nhúng vector.
    - **Completed**: Dữ liệu đã sẵn sàng để AI trả lời.
    - **Error**: Nếu gặp lỗi, hãy nhấn vào badge lỗi để xem chi tiết và dùng nút **Retry** để thử lại.

### 2.3 Quản trị người dùng & Cài đặt
- **User Management**: Kiểm tra danh sách người dùng, thay đổi vai trò hoặc Khóa (Ban) người dùng vi phạm.
- **System Settings**: Cấu hình các thông số hệ thống, lời chào và kết nối API. Mọi thay đổi đều được lưu audit log.

---

## 3. Cấu trúc Dự án (Project Structure)
- `/app`: Các route Next.js (Admin Dashboard, Chat Interface).
- `/api`: Hệ thống Backend API (Next.js Route Handlers).
- `/components/admin`: Các thành phần giao diện quản trị (Drawer, Editor, Tables).
- `/lib/db`: Lớp tương tác cơ sở dữ liệu (PostgreSQL).
- `/rag-service`: (Thư mục ngoài hoặc repo riêng) Chứa mã nguồn Python xử lý vectorization.

---
*Cập nhật lần cuối: Tháng 04/2026*
