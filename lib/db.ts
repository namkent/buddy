import { Pool, QueryResult } from 'pg';
import bcrypt from "bcryptjs";

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
        is_banned BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create or migrate Admin account with hashed password
    const userAdmin = await pool.query("SELECT password_hash FROM users WHERE email = 'admin@mes.local'");
    if (userAdmin.rowCount === 0) {
      const hashed = await bcrypt.hash('12345', 10);
      await pool.query(
        `INSERT INTO users (id, user_name, email, password_hash, role_id) 
        VALUES ('admin', 'Admin', 'admin@mes.local', $1, 3)`,
        [hashed]
      );
    } else if (userAdmin.rows[0].password_hash === '12345') {
      const hashed = await bcrypt.hash('12345', 10);
      await pool.query(`UPDATE users SET password_hash = $1 WHERE email = 'admin@mes.local'`, [hashed]);
    }

    await pool.query(`
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

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS thread_suggestions (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        is_auto_generated BOOLEAN DEFAULT FALSE,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Seed default settings if they don't exist
    await pool.query(`
      INSERT INTO system_settings (key, value, description) VALUES
      ('WELCOME_TITLE', 'Xin chào!', 'Tiêu đề lời chào mừng ở đầu cuộc trò chuyện'),
      ('WELCOME_SUBTITLE', 'Tôi có thể giúp gì cho bạn không?', 'Nội dung lời chào mừng ở đầu cuộc trò chuyện'),
      ('SYSTEM_PROMPT', 'Bạn là trợ lý ảo MES Buddy, giúp giải quyết các công việc trong hệ thống.', 'Prompt hệ thống để định hướng phản hồi của LLM'),
      ('ENABLE_TOOL_TRANSLATE', 'true', 'Bật tính năng dịch thuật'),
      ('ENABLE_TOOL_RAG_SEARCH', 'true', 'Bật tính năng RAG Search')
      ON CONFLICT (key) DO NOTHING;
    `);
    
    // Add columns dynamically if tables already existed without altering constraints fatally
    try {
      await pool.query('ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
      await pool.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false');
      // Track last activity for "online" detection (5-min window)
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP WITH TIME ZONE');
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
    async updatePassword(email: string, password_hash: string) {
      await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [password_hash, email]);
    },
    async updateLastActive(userId: string) {
      await pool.query('UPDATE users SET last_active = NOW() WHERE id = $1', [userId]);
    },
    async create(user: { id: string, name?: string, email?: string, avatar?: string, password_hash?: string }) {
      const res = await pool.query(
        'INSERT INTO users (id, user_name, email, avatar, role_id, password_hash) VALUES ($1, $2, $3, $4, 1, $5) RETURNING *',
        [user.id, user.name, user.email, user.avatar, user.password_hash || null]
      );
      return res.rows[0];
    },
    async findAll() {
      const res = await pool.query('SELECT u.*, r.name as role FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.created_at DESC');
      return res.rows;
    },
    async update(id: string, data: { role_id?: number; is_banned?: boolean }) {
      const updates = [];
      const values = [];
      let i = 1;

      if (data.role_id !== undefined) {
        updates.push(`role_id = $${i++}`);
        values.push(data.role_id);
      }
      if (data.is_banned !== undefined) {
        updates.push(`is_banned = $${i++}`);
        values.push(data.is_banned);
      }

      if (updates.length > 0) {
        values.push(id);
        await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, values);
      }
    },
    async delete(id: string) {
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    },
    async getStats() {
      // Simple COUNT queries — fast with small-medium tables, no extra indexes needed
      const usersRes = await pool.query('SELECT COUNT(*) FROM users');
      const threadsRes = await pool.query('SELECT COUNT(*) FROM chat_threads');
      const messagesRes = await pool.query('SELECT COUNT(*) FROM chat_messages');

      // Online = pinged heartbeat in last 60s (heartbeat runs every 30s from client)
      const onlineRes = await pool.query(
        `SELECT COUNT(*) FROM users WHERE last_active >= NOW() - INTERVAL '60 seconds'`
      );

      // Top 10 users by messages sent (role='user' = human side only).
      // Efficient: GROUP BY on user_id which is a foreign key. Index on (user_id, role) is ideal but not required.
      const topUsersRes = await pool.query(`
        SELECT u.user_name, u.email, u.avatar, COUNT(*) as msg_count
        FROM chat_messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.role = 'user'
        GROUP BY u.id, u.user_name, u.email, u.avatar
        ORDER BY msg_count DESC
        LIMIT 10
      `);

      // Messages per day for last 7 days. Uses date truncation with created_at.
      // Index on created_at recommended for large tables, but fine without for typical usage.
      const weeklyRes = await pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('day', created_at), 'Dy') as day_label,
          DATE_TRUNC('day', created_at) as day_date,
          COUNT(*) as count
        FROM chat_messages
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND role = 'user'
        GROUP BY day_date, day_label
        ORDER BY day_date ASC
      `);

      return {
        usersCount: parseInt(usersRes.rows[0].count),
        threadsCount: parseInt(threadsRes.rows[0].count),
        messagesCount: parseInt(messagesRes.rows[0].count),
        onlineCount: parseInt(onlineRes.rows[0].count),
        topUsers: topUsersRes.rows,
        weeklyMessages: weeklyRes.rows,
      };
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
  },

  settings: {
    async getAll() {
      const res = await pool.query('SELECT * FROM system_settings ORDER BY key ASC');
      return res.rows;
    },
    async get(key: string) {
      const res = await pool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
      return res.rows[0]?.value || null;
    },
    async set(key: string, value: string, description?: string) {
      if (description !== undefined) {
        await pool.query(
          'INSERT INTO system_settings (key, value, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP',
          [key, value, description]
        );
      } else {
        await pool.query(
          'INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP',
          [key, value]
        );
      }
    }
  },

  suggestions: {
    async getAll() {
      const res = await pool.query('SELECT * FROM thread_suggestions ORDER BY created_at DESC');
      return res.rows;
    },
    async getActiveRandom(limit: number = 4) {
      const res = await pool.query('SELECT * FROM thread_suggestions WHERE active = TRUE ORDER BY RANDOM() LIMIT $1', [limit]);
      return res.rows;
    },
    async create(data: { title: string, prompt: string, is_auto_generated?: boolean }) {
      const res = await pool.query(
        'INSERT INTO thread_suggestions (title, prompt, is_auto_generated) VALUES ($1, $2, $3) RETURNING *',
        [data.title, data.prompt, data.is_auto_generated || false]
      );
      return res.rows[0];
    },
    async update(id: number, data: any) {
      const fields = Object.keys(data);
      if (fields.length === 0) return;
      const values = Object.values(data);
      const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      await pool.query(`UPDATE thread_suggestions SET ${setClause} WHERE id = $1`, [id, ...values]);
    },
    async delete(id: number) {
      await pool.query('DELETE FROM thread_suggestions WHERE id = $1', [id]);
    }
  }
};