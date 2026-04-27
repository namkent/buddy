/**
 * HTTP client gọi AI Service tại localhost:3005/v1.
 * Dịch vụ Memory hỗ trợ lưu trữ và truy xuất bộ nhớ dài hạn (Mem0 style).
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:3005/v1";

export const memory = {
  /**
   * Lưu tin nhắn mới vào bộ nhớ dài hạn của user.
   */
  async add(text: string, options: { userId: string }) {
    const res = await fetch(`${AI_SERVICE_URL}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }],
        user_id: options.userId,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Memory add failed: ${err}`);
    }
    return res.json();
  },

  /**
   * Tìm kiếm context liên quan trong bộ nhớ dài hạn của user.
   */
  async search(query: string, options: { userId: string }): Promise<string> {
    const res = await fetch(`${AI_SERVICE_URL}/memories/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, user_id: options.userId, top_k: 10 }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Memory search failed: ${err}`);
    }
    const data = await res.json();
    const results: any[] = data.results || [];
    if (results.length === 0) return "";
    
    // Format kết quả thành danh sách các sự kiện đã nhớ kèm category và score
    return results.map((m: any) => `- [${m.category?.toUpperCase() || 'FACT'}] ${m.memory} (score: ${m.score?.toFixed(2) || 'N/A'})`).join("\n");
  },
};
