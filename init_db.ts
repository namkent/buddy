import { dbConnection } from './lib/db';

async function main() {
  console.log("Initializing database...");
  try {
    await dbConnection.initTables();
    console.log("✅ Tables initialized successfully!");
    
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
      { type: 'message', key: 'hello', en: 'Hello', vi: 'Xin chào', kr: '안녕하세요' },
    ];

    for (const t of initialTranslations) {
      await dbConnection.translations.upsert(t);
    }
    console.log("✅ Initial translations seeded!");
  } catch (error) {
    console.error("❌ Database initialization failed:");
    console.error(error);
    process.exit(1);
  }
  process.exit(0);
}

main();
