
import { pool } from "./lib/db";

async function runMigration() {
  try {
    console.log("Running migration: ADD parent_id to chat_messages...");
    await pool.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL');
    console.log("Migration successful!");
  } catch (e) {
    console.error("Migration failed:", e);
  } finally {
    process.exit();
  }
}

runMigration();
