import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

/**
 * Client kết nối tới LLM (Qwen Offline hoặc Groq Dev)
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY || "local",
  baseURL: process.env.OPENAI_BASE_URL || "http://localhost:11434/v1", // Mặc định local nếu không có env
});

export const llm = {
  /**
   * Gọi LLM để xử lý logic (Trích xuất, tóm tắt...)
   */
  async chat(messages: any[], options: { temperature?: number, max_tokens?: number } = {}) {
    try {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "qwen2.5-7b-instruct",
        messages,
        temperature: options.temperature ?? 0.1, // Thấp để trích xuất chính xác
        max_tokens: options.max_tokens ?? 500,
      });

      return response.choices[0].message.content;
    } catch (error: any) {
      console.error(`\x1b[31m[LLM-Error]\x1b[0m:`, error.message);
      throw error;
    }
  }
};
