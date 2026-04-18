import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { dbConnection } from "@/lib/db";
import { requireAuth, errorResponse, successResponse } from "@/lib/api-utils";

/**
 * Cấu hình model cho AI
 */
const openai = createOpenAI({
  apiKey: process.env.OPENAI_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

/**
 * [POST] Tự động tạo tiêu đề cho đoạn chat dựa trên nội dung tin nhắn
 */
export async function POST(req: Request) {
  // 1. Xác thực người dùng và kiểm quyền Guest
  const { error, user } = await requireAuth();
  if (error) return error;

  if (user?.role === "guest") {
    const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
    if (enableGuest !== "true") return errorResponse("Tính năng bị giới hạn cho khách", 403);
  }

  try {
    const { message, isPeriodic } = await req.json();

    // Trường hợp chưa có tin nhắn, trả về tiêu đề mặc định
    if (!message) {
      return successResponse({ title: "Cuộc hội thoại mới" });
    }

    // 2. Xây dựng prompt để LLM tạo tiêu đề
    const promptText = isPeriodic
      ? `Dựa vào lịch sử đoạn chat gần đây sau đây, hãy đặt một tiêu đề thật ngắn gọn (tối đa 4-5 từ) tóm tắt nội dung chính của cuộc hội thoại. Chỉ trả về đúng đoạn text của tiêu đề, không cần bọc trong ngoặc kép hay giải thích gì thêm.\n\nLịch sử chat:\n"${message}"`
      : `Dựa vào đoạn tin nhắn mở đầu sau đây, hãy đặt một tiêu đề thật ngắn gọn (tối đa 4-5 từ) cho cuộc hội thoại. Chỉ trả về đúng đoạn text của tiêu đề, không cần bọc trong ngoặc kép hay giải thích gì thêm.\n\nTin nhắn: "${message}"`
      + '\nHãy thêm icon emoji liên quan đến nội dung tiêu đề vào đầu tiêu đề.';

    // 3. Gọi AI để sinh tiêu đề
    const { text } = await generateText({
      model: openai.chat(process.env.OPENAI_MODEL || "llama-3.3-70b-versatile"),
      prompt: promptText,
      providerOptions: {
        openai: { reasoningSummary: "auto" },
      },
    });

    // Làm sạch kết quả (loại bỏ thẻ <think> nếu có)
    const cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    return successResponse({ title: cleanText });
  } catch (error) {
    console.error("Generate title fail:", error);
    return errorResponse("Không thể tạo tiêu đề tự động", 500);
  }
}
