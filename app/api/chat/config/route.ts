import { dbConnection } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api-utils";

export const dynamic = 'force-dynamic';

/**
 * [GET] Lấy cấu hình giao diện chào mừng và các tính năng kích hoạt của AI
 * Endpoint này thường được gọi ngay khi người dùng mở trang web (Public hoặc sau login)
 */
export async function GET() {
  try {
    // Lấy tiêu đề và mô tả chào mừng từ cấu hình hệ thống
    const title = await dbConnection.settings.get("WELCOME_TITLE") || "Xin chào!";
    const subtitle = await dbConnection.settings.get("WELCOME_SUBTITLE") || "Tôi có thể giúp gì cho bạn không?";
    
    // Lấy ngẫu nhiên 4 gợi ý hội thoại
    const suggestions = await dbConnection.suggestions.getActiveRandom(4);

    // Kiểm tra trạng thái các công cụ (Tools) được bật/tắt trong Setting
    const summarize = await dbConnection.settings.get("ENABLE_TOOL_SUMMARIZE") !== "false";
    const translate = await dbConnection.settings.get("ENABLE_TOOL_TRANSLATE") !== "false";
    const search = await dbConnection.settings.get("ENABLE_TOOL_RAG_SEARCH") !== "false";

    return successResponse({
      welcome_title: title,
      welcome_subtitle: subtitle,
      suggestions: suggestions,
      features: {
        summarize,
        translate,
        search
      }
    });
  } catch (error) {
    console.error("Load initial config fail:", error);
    return errorResponse("Không thể tải cấu hình khởi tạo", 500);
  }
}
