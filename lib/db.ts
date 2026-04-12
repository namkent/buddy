import { Pool, QueryResult } from 'pg';

export interface ChatThread {
  id: string;
  title: string;
  archived: boolean;
  created_at?: Date;
}

const globalForPg = global as unknown as { pool: Pool };
export const pool = globalForPg.pool || new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

if (process.env.NODE_ENV !== 'production') globalForPg.pool = pool;

export const dbConnection = {
  async initTables(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );
      INSERT INTO roles (name) VALUES ('guest'), ('user'), ('admin') ON CONFLICT DO NOTHING;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        user_name TEXT,
        email TEXT UNIQUE,
        password_hash TEXT,
        role_id INTEGER REFERENCES roles(id) DEFAULT 1,
        avatar TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      INSERT INTO users (id, user_name, email, password_hash, role_id) 
      VALUES ('admin', 'Admin', 'admin@mes.local', '12345', 3) 
      ON CONFLICT DO NOTHING;

      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        title TEXT DEFAULT 'New Chat',
        archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT REFERENCES chat_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    
    // Add columns dynamically if tables already existed without altering constraints fatally
    try {
      await pool.query('ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
      await pool.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
    } catch(e) {}
  },

  users: {
    async findByEmail(email: string) {
      const res = await pool.query('SELECT u.*, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.email = $1', [email]);
      return res.rows[0] || null;
    },
    async findById(id: string) {
      const res = await pool.query('SELECT u.*, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1', [id]);
      return res.rows[0] || null;
    },
    async create(user: { id: string, name?: string, email?: string, avatar?: string }) {
      const res = await pool.query(
        'INSERT INTO users (id, user_name, email, avatar, role_id) VALUES ($1, $2, $3, $4, 1) RETURNING *',
        [user.id, user.name, user.email, user.avatar]
      );
      return res.rows[0];
    }
  },

  threads: {
    async findAll(userId: string): Promise<ChatThread[]> {
      const res: QueryResult<ChatThread> = await pool.query('SELECT * FROM chat_threads WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      return res.rows;
    },
    async findById(id: string): Promise<ChatThread | null> {
      const res: QueryResult<ChatThread> = await pool.query('SELECT * FROM chat_threads WHERE id = $1', [id]);
      return res.rows[0] || null;
    },
    async create({ id, userId }: { id: string, userId: string }): Promise<ChatThread> {
      const res = await pool.query(
        'INSERT INTO chat_threads (id, user_id) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id RETURNING *',
        [id, userId]
      );
      return res.rows[0];
    },
    async update(id: string, data: any): Promise<void> {
      const fields = Object.keys(data);
      if (fields.length === 0) return;
      const values = Object.values(data);
      const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      await pool.query(`UPDATE chat_threads SET ${setClause} WHERE id = $1`, [id, ...values]);
    },
    async delete(id: string): Promise<void> {
      await pool.query('DELETE FROM chat_threads WHERE id = $1', [id]);
    },
  },

  messages: {
    async findByThreadId(threadId: string) {
      const res = await pool.query(
        'SELECT id, role, content, created_at as "createdAt" FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC',
        [threadId]
      );
      return res.rows;
    },
    async create(message: any): Promise<void> {
      try {
        const thread_id = message.thread_id || message.threadId;
        if (!thread_id || !message.content) return;

        let textContent = "";
        if (Array.isArray(message.content)) {
          // Lưu nguyên array thành JSON để giữ lại attachments (image, file)
          textContent = JSON.stringify(message.content);
        } else {
          textContent = String(message.content);
        }

        await pool.query(
          'INSERT INTO chat_messages (id, thread_id, role, content, created_at, user_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [message.id, thread_id, message.role, textContent, message.createdAt || new Date(), message.userId || null]
        );
      } catch (error) {
        console.error("DB Message Error:", error);
      }
    },
  }
};