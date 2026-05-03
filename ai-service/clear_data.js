const { Pool } = require('pg');
const lancedb = require('@lancedb/lancedb');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // also load root .env if needed

async function run() {
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
  });

  try {
    await pool.query("DELETE FROM knowledge_files");
    console.log("Cleared Postgres knowledge_files.");
    
    const storageDir = process.env.EXTERNAL_STORAGE_PATH || path.join(__dirname, "..", "external_storage");
    const lancePath = path.join(storageDir, "lancedb");
    const db = await lancedb.connect(lancePath);
    const tables = await db.tableNames();
    if (tables.includes("knowledge_chunks")) {
      await db.dropTable("knowledge_chunks");
      console.log("Dropped LanceDB table knowledge_chunks.");
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    pool.end();
  }
}
run();
