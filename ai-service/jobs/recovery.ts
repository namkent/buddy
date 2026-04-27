import db from "../utils/db";
import { ragQueue } from "../utils/queue";
import { executeRagPipeline } from "../v1/ragController";
import fs from "fs";

/**
 * Khôi phục các tác vụ RAG bị gián đoạn khi server khởi động lại
 */
export default async function recoveryJob() {
  try {
    console.log(`\x1b[34m[RECOVERY]\x1b[0m Checking for interrupted RAG jobs...`);
    
    // Tìm các file đang ở trạng thái 'processing' hoặc 'pending' có file_path
    const { rows } = await db.query(
      "SELECT id, group_id, file_path, file_name FROM knowledge_files WHERE (status = 'processing' OR status = 'pending') AND file_path IS NOT NULL"
    );

    if (rows.length === 0) {
      console.log(`\x1b[34m[RECOVERY]\x1b[0m No interrupted jobs found.`);
      return;
    }

    console.log(`\x1b[34m[RECOVERY]\x1b[0m Found ${rows.length} jobs to resume.`);

    for (const row of rows) {
      ragQueue.add(() => executeRagPipeline({
        file_id: row.id,
        group_id: row.group_id,
        file_path: row.file_path, 
        file_name: row.file_name
      }));
    }
  } catch (error: any) {
    console.error(`\x1b[31m[RECOVERY-ERROR]\x1b[0m:`, error.message);
  }
}
