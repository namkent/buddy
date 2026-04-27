import { Request, Response } from 'express';
import fs from "fs";
import db from "../utils/db"; 
import lance from "../utils/lance";
import AIEngines from "../utils/engines";
import { parseFile } from "../utils/parser";
import { splitText } from "../utils/textSplitter";
import path from "path";
import { sseManager } from "../utils/sse";
import { ragQueue } from "../utils/queue";

const TABLE_NAME = "knowledge_chunks";

/**
 * Logic thực hiện pipeline RAG
 */
export async function executeRagPipeline(data: any) {
  const { file_id, group_id, file_path, file_name } = data;
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  try {
    console.log(`\x1b[36m[RAG-Queue]\x1b[0m Executing: ${file_name || file_id}`);
    
    // Giai đoạn 1: Khởi tạo
    await db.query("UPDATE knowledge_files SET status = 'processing', progress = 5 WHERE id = $1", [file_id]);
    sseManager.sendProgress(String(group_id), String(file_id), 5, 'processing', 'Init...');
    await sleep(300);

    // Giai đoạn 2: Đọc file
    sseManager.sendProgress(String(group_id), String(file_id), 10, 'processing', 'Parsing...');
    const mimeType = getMimeType(file_path);
    const text = await parseFile(file_path, mimeType, file_id, group_id);
    
    // Giai đoạn 2.5: Lưu bản sao Markdown để debug/so sánh
    try {
      const STORAGE_ROOT = process.env.EXTERNAL_STORAGE_PATH || 
                           (process.env.STORAGE_DIR ? path.join(process.env.STORAGE_DIR, "datas") : path.join(process.cwd(), "..", "external_storage"));

      let absoluteFilePath = file_path;
      if (file_path.startsWith("/") || !path.isAbsolute(file_path)) {
        const relativePath = file_path.startsWith("/") ? file_path.substring(1) : file_path;
        absoluteFilePath = path.join(STORAGE_ROOT, relativePath);
      }
      const markdownPath = absoluteFilePath.replace(/\.[^/.]+$/, ".md");
      const relativeImagesPath = `/group_${group_id}/file_${file_id}/images/`;
      const portableText = text.replace(new RegExp(relativeImagesPath, 'g'), './images/');
      fs.writeFileSync(markdownPath, portableText, "utf8");
    } catch (mdErr) { }
    
    // Giai đoạn 3: Chia nhỏ văn bản & Gắn Metadata (Trang)
    sseManager.sendProgress(String(group_id), String(file_id), 25, 'processing', 'Splitting...');
    
    let processedChunks: { text: string, metadata: any }[] = [];
    if (mimeType === "application/pdf") {
      // PDF parser của chúng ta chèn "## Page X" vào đầu mỗi trang
      const pageSections = text.split(/## Page (\d+)\n/);
      // pageSections[0] thường là rỗng hoặc text trước trang 1
      for (let i = 1; i < pageSections.length; i += 2) {
        const pageNum = parseInt(pageSections[i]);
        const pageContent = pageSections[i + 1];
        if (!pageContent?.trim()) continue;
        const subChunks = await splitText(pageContent);
        subChunks.forEach((sc, idx) => {
          processedChunks.push({
            text: sc,
            metadata: { source: file_name, file_path, index: processedChunks.length, file_id: parseInt(file_id), page: pageNum }
          });
        });
      }
    }

    // Nếu không phải PDF hoặc không tách được theo trang, xử lý bình thường
    if (processedChunks.length === 0) {
      const chunks = await splitText(text);
      processedChunks = chunks.map((c, i) => ({
        text: c,
        metadata: { source: file_name, file_path, index: i, file_id: parseInt(file_id) }
      }));
    }
    await sleep(300);

    // Giai đoạn 4: Vector Embedding
    sseManager.sendProgress(String(group_id), String(file_id), 30, 'processing', 'Loading AI...');
    const model = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
    const pipeline = await AIEngines.getPipeline("feature-extraction", model);
    
    const batchSize = 10;
    const totalChunks = processedChunks.length;
    let allVectors: any[] = [];

    for (let i = 0; i < totalChunks; i += batchSize) {
      const batch = processedChunks.slice(i, i + batchSize).map(pc => pc.text);
      const batchProgress = Math.floor(30 + (i / totalChunks) * 60);
      sseManager.sendProgress(String(group_id), String(file_id), batchProgress, 'processing', `Embedding (${i}/${totalChunks})...`);
      const output = await pipeline(batch, { pooling: "mean", normalize: true });
      allVectors.push(...output.tolist());
    }

    // Giai đoạn 5: Lưu vào LanceDB
    sseManager.sendProgress(String(group_id), String(file_id), 90, 'processing', 'Saving...');
    const lancedb = await lance.getDb();
    const dataToInsert = processedChunks.map((pc, i) => ({
      vector: allVectors[i],
      text: pc.text,
      file_id: parseInt(file_id),
      group_id: parseInt(group_id),
      metadata: JSON.stringify(pc.metadata)
    }));

    const tables = await lancedb.tableNames();
    if (tables.includes(TABLE_NAME)) {
      const table = await lancedb.openTable(TABLE_NAME);
      await table.delete(`file_id = ${file_id}`);
      await table.add(dataToInsert);
    } else {
      await lancedb.createTable(TABLE_NAME, dataToInsert);
    }

    await db.query("UPDATE knowledge_files SET status = 'completed', progress = 100, error_message = NULL WHERE id = $1", [file_id]);
    sseManager.sendProgress(String(group_id), String(file_id), 100, 'completed', 'Done');
  } catch (error: any) {
    await db.query("UPDATE knowledge_files SET status = 'error', error_message = $1 WHERE id = $2", [error.message, file_id]);
    sseManager.sendProgress(String(group_id), String(file_id), 0, 'error', 'Failed');
  }
}

export const processRagFile = async (req: Request, res: Response) => {
  const { file_id, group_id, file_path, file_name } = req.body;
  if (!file_id || !group_id || !file_path) return res.status(400).json({ error: "Missing fields" });
  res.json({ status: "queued" });
  ragQueue.add(() => executeRagPipeline({ file_id, group_id, file_path, file_name }));
};

export const searchRag = async (req: Request, res: Response) => {
  const { query, group_id, file_ids, top_k = 5 } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });

  try {
    const model = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
    const pipeline = await AIEngines.getPipeline("feature-extraction", model);
    const output = await pipeline([query], { pooling: "mean", normalize: true });
    const vector = output.tolist()[0];

    const lancedb = await lance.getDb();
    const tables = await lancedb.tableNames();
    if (!tables.includes(TABLE_NAME)) return res.json({ results: [] });

    const table = await lancedb.openTable(TABLE_NAME);
    let queryBuilder = table.search(vector).limit(top_k);
    
    const filters = [];
    if (group_id) filters.push(`group_id = ${group_id}`);
    if (file_ids && Array.isArray(file_ids) && file_ids.length > 0) {
      filters.push(`file_id IN (${file_ids.join(",")})`);
    }

    if (filters.length > 0) {
      queryBuilder = queryBuilder.where(filters.join(" AND "));
    }

    const results = await queryBuilder.toArray();
    const formattedResults = results.map(r => ({
      text: (r as any).text,
      file_id: (r as any).file_id,
      score: 1 - (r as any)._distance,
      metadata: typeof (r as any).metadata === 'string' ? JSON.parse((r as any).metadata) : (r as any).metadata
    }));

    res.json({ results: formattedResults });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const syncRag = async (req: Request, res: Response) => {
  try {
    const lancedb = await lance.getDb();
    const tables = await lancedb.tableNames();
    if (!tables.includes(TABLE_NAME)) return res.json({ success: true, valid_count: 0 });
    const table = await lancedb.openTable(TABLE_NAME);
    const { rows } = await db.query("SELECT id FROM knowledge_files");
    const validIds = rows.map(r => r.id);
    if (validIds.length > 0) await table.delete(`file_id NOT IN (${validIds.join(",")})`);
    else await table.delete("true");
    res.json({ success: true, valid_count: await table.countRows() });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
};

export const deleteFileRag = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query("SELECT group_id FROM knowledge_files WHERE id = $1", [id]);
    const groupId = rows[0]?.group_id;
    const lancedb = await lance.getDb();
    const tables = await lancedb.tableNames();
    if (tables.includes(TABLE_NAME)) {
      const table = await lancedb.openTable(TABLE_NAME);
      await table.delete(`file_id = ${id}`);
    }
    if (groupId) {
      const STORAGE_ROOT = process.env.EXTERNAL_STORAGE_PATH || path.join(process.cwd(), "..", "external_storage");
      const fileFolder = path.join(STORAGE_ROOT, `group_${groupId}`, `file_${id}`);
      if (fs.existsSync(fileFolder)) fs.rmSync(fileFolder, { recursive: true, force: true });
    }
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
};

function getMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".txt") return "text/plain";
  if (ext === ".html") return "text/html";
  return "text/plain";
}

export default { processRagFile, searchRag, syncRag, deleteFileRag };
