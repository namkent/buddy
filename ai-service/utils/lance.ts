import * as lancedb from "@lancedb/lancedb";
import path from "path";
import fs from "fs";

// Ưu tiên sử dụng STORAGE_DIR từ .env, nếu không có mới dùng folder local
const storageBase = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
export const DB_PATH = path.join(storageBase, "vector_db");


// Đảm bảo thư mục tồn tại
if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(DB_PATH, { recursive: true });
}

let dbInstance: lancedb.Connection | null = null;

export async function getDb(): Promise<lancedb.Connection> {
  if (!dbInstance) {
    dbInstance = await lancedb.connect(DB_PATH);
  }
  return dbInstance;
}

export async function getTable(tableName: string = "knowledge_chunks"): Promise<lancedb.Table | null> {
  const db = await getDb();
  const tables = await db.tableNames();
  
  if (tables.includes(tableName)) {
    return await db.openTable(tableName);
  }
  
  return null; 
}

export default {
  getDb,
  getTable,
  DB_PATH
};
