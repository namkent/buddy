/**
 * HTTP client gọi Python Mem0 FastAPI service tại localhost:8000.
 * Endpoints: POST /memories (add), POST /search (query context).
 */

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:8000";

export const memory = {
  /**
   * Lưu tin nhắn mới vào vector memory của user.
   */
  async add(text: string, options: { userId: string }) {
    const res = await fetch(`${RAG_SERVICE_URL}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }],
        user_id: options.userId,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Mem0 add failed: ${err}`);
    }
    return res.json();
  },

  /**
   * Tìm kiếm context liên quan trong vector memory của user.
   * Trả về chuỗi context đã format, hoặc "" nếu không có gì.
   */
  async search(query: string, options: { userId: string }): Promise<string> {
    const res = await fetch(`${RAG_SERVICE_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, user_id: options.userId, top_k: 5 }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Mem0 search failed: ${err}`);
    }
    const data = await res.json();
    const results: any[] = data.results || [];
    if (results.length === 0) return "";
    return results.map((m: any) => `- ${m.memory || m.text || JSON.stringify(m)}`).join("\n");
  },
};
