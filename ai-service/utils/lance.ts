import * as lancedb from "@lancedb/lancedb";
import path from "path";
import fs from "fs";

// Chuyển DB_PATH thành function/getter để đảm bảo lấy đúng env var khi runtime
export function getDbPath(): string {
  const storageBase = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
  return path.join(storageBase, "vector_db");
}

let dbInstance: lancedb.Connection | null = null;

export async function getDb(): Promise<lancedb.Connection> {
  const DB_PATH = getDbPath();
  
  // Đảm bảo thư mục tồn tại
  if (!fs.existsSync(DB_PATH)) {
    console.log(`\x1b[35m[LANCE]\x1b[0m Creating vector DB directory: ${DB_PATH}`);
    fs.mkdirSync(DB_PATH, { recursive: true });
  }

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
  getDbPath
};
