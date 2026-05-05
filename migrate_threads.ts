import "dotenv/config";
import { pool } from "./lib/db";

async function migrate() {
  console.log("Starting migration: adding updated_at to chat_threads...");
  try {
    await pool.query(`
      ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);
    console.log("Migration successful!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit();
  }
}

migrate();
