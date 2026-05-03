import { Request, Response } from 'express';
import lance from "../utils/lance";
import AIEngines from "../utils/engines";
import { v4 as uuidv4 } from "uuid";
import { extractFactsFromMessage } from "../utils/memoryEngine";
import { ragQueue } from "../utils/queue"; // Tái sử dụng queue để bảo vệ CPU

const TABLE_NAME = "user_memories";

/**
 * [POST] Thêm bộ nhớ mới cho user (Gemini-style)
 */
export const addMemory = async (req: Request, res: Response) => {
  const { messages, user_id } = req.body;

  if (!messages || !user_id) {
    return res.status(400).json({ error: "Missing messages or user_id" });
  }

  const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
  const text = lastUserMsg ? lastUserMsg.content : "";

  if (!text) return res.json({ success: true, message: "No user message to remember" });

  // Trả về ngay lập tức, việc trích xuất sẽ chạy ngầm
  res.json({ success: true, message: "Memory extraction queued" });

  // Đưa vào hàng đợi xử lý ngầm
  ragQueue.add(async () => {
    try {
      console.log(`\x1b[35m[Memory-Extraction]\x1b[0m Extracting facts for user: ${user_id}`);

      const facts = await extractFactsFromMessage(text);
      if (facts.length === 0) return;

      const model = process.env.EMBEDDING_MODEL || "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
      const pipeline = await AIEngines.getPipeline("feature-extraction", model);
      const lancedb = await lance.getDb();

      for (const item of facts) {
        let output = await pipeline([item.fact], { pooling: "mean", normalize: true });
        let vector = output.tolist()[0];

        // --- Kiểm tra trùng lặp ngữ nghĩa (Semantic Deduplication & Consolidation) ---
        const tables = await lancedb.tableNames();
        let finalFact = item.fact;
        let isUpdate = false;
        let oldId = "";

        if (tables.includes(TABLE_NAME)) {
          const table = await lancedb.openTable(TABLE_NAME);
          const similar = await table
            .search(vector)
            .where(`user_id = '${user_id}'`)
            .limit(1)
            .toArray();

          if (similar.length > 0) {
            const bestMatch = similar[0] as any;
            const distance = bestMatch._distance;
            
            // Nếu cực kỳ giống (distance rất nhỏ), coi như trùng lặp hoàn toàn
            if (distance < 0.1) {
              console.log(`\x1b[33m[Memory-Skip]\x1b[0m Exact match exists: ${item.fact}`);
              continue;
            }

            // Nếu tương đối giống, thực hiện Hòa trộn (Consolidation)
            if (distance < 0.35) {
              const { consolidateMemories } = await import("../utils/memoryEngine");
              const oldFact = bestMatch.fact || bestMatch.text;
              const { action, result } = await consolidateMemories(oldFact, item.fact);

              if (action === "ignore") {
                console.log(`\x1b[33m[Memory-Ignore]\x1b[0m No new info: ${item.fact}`);
                continue;
              } else if (action === "update") {
                console.log(`\x1b[32m[Memory-Update]\x1b[0m Updating fact: ${oldFact} -> ${result}`);
                finalFact = result || item.fact;
                isUpdate = true;
                oldId = bestMatch.id;
                // Re-calculate vector for updated fact
                const updOutput = await pipeline([finalFact], { pooling: "mean", normalize: true });
                vector = updOutput.tolist()[0];
              }
            }
          }
        }

        const dataToInsert = [{
          id: uuidv4(),
          vector: vector,
          text: finalFact, 
          fact: finalFact,
          category: item.category,
          user_id: user_id.toString(),
          created_at: new Date().toISOString()
        }];

        if (tables.includes(TABLE_NAME)) {
          const table = await lancedb.openTable(TABLE_NAME);
          if (isUpdate && oldId) {
            // Xóa bản ghi cũ trước khi thêm bản ghi đã cập nhật
            await table.delete(`id = '${oldId}'`);
          }
          await table.add(dataToInsert);
        } else {
          await lancedb.createTable(TABLE_NAME, dataToInsert);
        }
      }

      console.log(`\x1b[32m[Memory-Success]\x1b[0m Extracted ${facts.length} facts for user: ${user_id}`);
    } catch (err: any) {
      console.error(`\x1b[31m[Memory-Extraction-Error]\x1b[0m:`, err.message);
    }
  });
};

/**
 * [POST] Tìm kiếm bộ nhớ liên quan
 */
export const searchMemory = async (req: Request, res: Response) => {
  const { query, user_id, top_k = 10 } = req.body;

  if (!query || !user_id) {
    return res.status(400).json({ error: "Missing query or user_id" });
  }

  try {
    const model = process.env.EMBEDDING_MODEL || "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
    const pipeline = await AIEngines.getPipeline("feature-extraction", model);
    const output = await pipeline([query], { pooling: "mean", normalize: true });
    const vector = output.tolist()[0];

    const lancedb = await lance.getDb();
    const tables = await lancedb.tableNames();

    if (!tables.includes(TABLE_NAME)) {
      return res.json({ results: [] });
    }

    const table = await lancedb.openTable(TABLE_NAME);
    const results = await table
      .search(vector)
      .where(`user_id = '${user_id}'`)
      .limit(top_k)
      .toArray();

    const formattedResults = results
      .filter(r => {
        const fact = ((r as any).fact || (r as any).text || "").toLowerCase();
        const score = 1 - (r as any)._distance;
        // Lọc theo nội dung rác
        const isJunk = fact.includes("user is searching for") ||
          fact.includes("user is looking for") ||
          fact.includes("user asked about");
        // Lọc theo độ tương đồng (Threshold: 0.3)
        return !isJunk && score >= 0.3;
      })
      .map(r => ({
        memory: (r as any).fact || (r as any).text,
        category: (r as any).category || "other",
        score: 1 - (r as any)._distance,
        id: (r as any).id
      }));

    res.json({ results: formattedResults });
  } catch (error: any) {
    console.error(`\x1b[31m[Memory-Search-Error]\x1b[0m:`, error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * [DELETE] Xóa toàn bộ bộ nhớ của user
 */
export const clearMemories = async (req: Request, res: Response) => {
  const { user_id } = req.params;
  try {
    const lancedb = await lance.getDb();
    const tables = await lancedb.tableNames();
    if (tables.includes(TABLE_NAME)) {
      const table = await lancedb.openTable(TABLE_NAME);
      await table.delete(`user_id = '${user_id}'`);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export default {
  addMemory,
  searchMemory,
  clearMemories
};
