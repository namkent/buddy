const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Thủ công đọc .env
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/^"|"$/g, '');
    }
  });
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function migrate() {
  try {
    console.log('Starting migration to relative paths...');
    
    // Tìm tất cả các file có chứa http://localhost:8080 hoặc các domain khác
    // Chúng ta sẽ dùng regex hoặc REPLACE để loại bỏ phần hằng số
    // Ở đây tôi sẽ xóa mọi thứ trước /group_
    
    const res = await pool.query(`
      UPDATE knowledge_files 
      SET file_path = REGEXP_REPLACE(file_path, '^https?://[^/]+', '')
      WHERE file_path LIKE 'http%'
    `);
    
    console.log(`Updated ${res.rowCount} records to relative paths.`);
    
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
