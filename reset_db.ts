import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import bcrypt from "bcryptjs";
import { pool, dbConnection } from './lib/db';

async function main() {
  console.log("⚠️  RESETTING DATABASE... ALL DATA WILL BE LOST!");
  
  try {
    // List of tables to drop in correct order or with CASCADE
    const tables = [
      'system_logs',
      'chat_messages',
      'chat_threads',
      'knowledge_files',
      'knowledge_groups',
      'agents',
      'system_settings',
      'thread_suggestions',
      'translations',
      'i18n_types',
      'users',
      'roles'
    ];

    console.log("Dropping tables...");
    for (const table of tables) {
      await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    console.log("✅ All tables dropped.");
    
    console.log("Re-initializing database schema...");
    await dbConnection.initTables();
    console.log("✅ Tables initialized.");

    console.log("Seeding core data (roles, types, settings)...");
    
    // Roles
    await pool.query("INSERT INTO roles (name) VALUES ('guest'), ('user'), ('admin') ON CONFLICT DO NOTHING");
    
    // I18n Types
    await pool.query("INSERT INTO i18n_types (name) VALUES ('label'), ('menu'), ('message'), ('notify'), ('status') ON CONFLICT DO NOTHING");

    // System Settings
    const settings = [
      { key: 'WELCOME_TITLE', value: 'Xin chào!', description: 'Tiêu đề lời chào mừng ở đầu cuộc trò chuyện' },
      { key: 'WELCOME_SUBTITLE', value: 'Tôi có thể giúp gì cho bạn không?', description: 'Nội dung lời chào mừng ở đầu cuộc trò chuyện' },
      { key: 'SYSTEM_PROMPT', value: 'Bạn là trợ lý ảo MES Buddy, giúp giải quyết các công việc trong hệ thống.', description: 'Prompt hệ thống để định hướng phản hồi của LLM' },
      { key: 'ENABLE_TOOL_TRANSLATE', value: 'true', description: 'Bật tính năng dịch thuật' },
      { key: 'ENABLE_TOOL_RAG_SEARCH', value: 'true', description: 'Bật tính năng RAG Search' },
      { key: 'ENABLE_TOOL_AGENTS', value: 'true', description: 'Bật tính năng Tác nhân AI (Agents)' },
      { key: 'ENABLE_GUEST_ACCESS', value: 'false', description: 'Cho phép người dùng chưa phân quyền (Guest) được nhắn tin' }
    ];
    for (const s of settings) {
      await dbConnection.settings.set(s.key, s.value, s.description);
    }

    console.log("Seeding custom admin user...");
    const adminPasswordHash = await bcrypt.hash('123456', 10);
    await pool.query(
      `INSERT INTO users (id, user_name, email, password_hash, role_id) 
       VALUES ('admin', 'Admin', 'admin@sdv.mes', $1, 3)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash`,
      [adminPasswordHash]
    );
    console.log("✅ Core data and custom admin seeded.");

    console.log("Seeding initial translations...");
    const initialTranslations = [
      { type: 'menu', key: 'new_thread', en: 'New Thread', vi: 'Cuộc hội thoại mới', kr: '새 대화' },
      { type: 'label', key: 'new_chat', en: 'New Chat', vi: 'Chat mới', kr: '새 채팅' },
      { type: 'label', key: 'archive', en: 'Archive', vi: 'Lưu trữ', kr: '보관' },
      { type: 'label', key: 'unarchive', en: 'Unarchive', vi: 'Bỏ lưu trữ', kr: '보관 해제' },
      { type: 'label', key: 'delete', en: 'Delete', vi: 'Xóa', kr: '삭제' },
      { type: 'label', key: 'archived', en: 'Archived', vi: 'Đã lưu trữ', kr: '보관됨' },
      { type: 'label', key: 'home', en: 'Home', vi: 'Trang chủ', kr: '홈' },
      { type: 'label', key: 'settings', en: 'Settings', vi: 'Cài đặt', kr: '설정' },
      { type: 'label', key: 'save', en: 'Save', vi: 'Lưu', kr: 'Lưu' },
      { type: 'label', key: 'cancel', en: 'Cancel', vi: 'Hủy', kr: 'Hủy' },
      { type: 'label', key: 'edit', en: 'Edit', vi: 'Sửa', kr: 'Sửa' },
      { type: 'label', key: 'add', en: 'Add', vi: 'Thêm', kr: 'Thêm' },
      { type: 'label', key: 'search', en: 'Search', vi: 'Tìm kiếm', kr: 'Tìm kiếm' },
      { type: 'message', key: 'hello', en: 'Hello', vi: 'Xin chào', kr: '안녕하세요' },
      { type: 'status', key: 'active', en: 'Active', vi: 'Hoạt động', kr: 'Hoạt động' },
      { type: 'status', key: 'inactive', en: 'Inactive', vi: 'Ngừng hoạt động', kr: 'Ngừng hoạt động' },
    ];

    for (const t of initialTranslations) {
      await dbConnection.translations.upsert(t);
    }
    console.log("✅ Initial translations seeded!");

    console.log("Seeding default knowledge group...");
    await dbConnection.knowledge.createGroup("Tài liệu chung", "Thư mục chứa các tài liệu hướng dẫn chung của hệ thống", true);
    console.log("✅ Default knowledge group seeded!");

    console.log("Seeding default agent...");
    await dbConnection.agents.create({
      id: 'mes-buddy',
      name: 'MES Buddy',
      description: 'Trợ lý ảo hỗ trợ công việc MES',
      system_prompt: 'Bạn là trợ lý ảo MES Buddy, giúp giải quyết các công việc trong hệ thống.',
      icon: 'Bot',
      is_active: true
    });
    console.log("✅ Default agent seeded!");

    console.log("Seeding default thread suggestions...");
    const suggestions = [
      { title: "Hướng dẫn sử dụng", prompt: "Hãy hướng dẫn tôi cách sử dụng hệ thống MES Buddy này." },
      { title: "Tạo báo cáo", prompt: "Giúp tôi tóm tắt các công việc cần làm trong ngày hôm nay dựa trên dữ liệu kiến thức." },
      { title: "Tra cứu tài liệu", prompt: "Tôi muốn tìm hiểu về quy trình vận hành máy trong kho." }
    ];
    for (const s of suggestions) {
      await dbConnection.suggestions.create(s);
    }
    console.log("✅ Default suggestions seeded!");

    console.log("Resetting RAG (LanceDB & Storage)...");
    try {
      const storageDir = process.env.EXTERNAL_STORAGE_PATH || 'P:/web/mes-storage/datas';
      const lancedbPath = path.join(storageDir, "lancedb");
      
      if (fs.existsSync(lancedbPath)) {
        console.log(`Deleting LanceDB at: ${lancedbPath}`);
        fs.rmSync(lancedbPath, { recursive: true, force: true });
      }

      // Clear other storage folders if they exist
      const foldersToClear = ['uploads', 'processed', 'temp'];
      for (const folder of foldersToClear) {
        const folderPath = path.join(storageDir, folder);
        if (fs.existsSync(folderPath)) {
          console.log(`Clearing storage folder: ${folderPath}`);
          fs.rmSync(folderPath, { recursive: true, force: true });
          fs.mkdirSync(folderPath, { recursive: true });
        }
      }
      console.log("✅ RAG reset successfully!");
    } catch (ragError) {
      console.warn("⚠️ RAG reset encountered some issues (likely minor):", ragError);
    }

  } catch (error) {
    console.error("❌ Database reset failed:");
    console.error(error);
    process.exit(1);
  }
  
  console.log("✨ Database reset successfully!");
  process.exit(0);
}

main();
