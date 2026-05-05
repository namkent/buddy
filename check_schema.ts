
import { pool } from "./lib/db";

async function checkSchema() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'chat_messages'
    `);
    console.log("Columns in chat_messages:");
    console.table(res.rows);
  } catch (e) {
    console.error("Failed to check schema:", e);
  } finally {
    process.exit();
  }
}

checkSchema();
