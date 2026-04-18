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

      CREATE TABLE IF NOT EXISTS knowledge_groups (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS knowledge_files (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES knowledge_groups(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        file_size BIGINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        level TEXT NOT NULL, -- 'info', 'error', 'warn'
        source TEXT NOT NULL, -- 'knowledge_base', 'auth', 'system', 'users'
        message TEXT NOT NULL,
        details TEXT,
        content TEXT,
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
      ('ENABLE_TOOL_RAG_SEARCH', 'true', 'Bật tính năng RAG Search'),
      ('ENABLE_TOOL_SUMMARIZE', 'true', 'Bật tính năng Tóm tắt Chat'),
      ('ENABLE_GUEST_ACCESS', 'false', 'Cho phép người dùng chưa phân quyền (Guest) được nhắn tin')
      ON CONFLICT (key) DO NOTHING;
    `);
    
    // Add columns dynamically if tables already existed without altering constraints fatally
    try {
      await pool.query('ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
      await pool.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false');
      // Track last activity for "online" detection (5-min window)
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP WITH TIME ZONE');
      // Add error_message to knowledge_files
      await pool.query('ALTER TABLE knowledge_files ADD COLUMN IF NOT EXISTS error_message TEXT');
      await pool.query('ALTER TABLE knowledge_groups ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE');
      await pool.query('ALTER TABLE knowledge_files ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE');
      await pool.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS feedback INTEGER');
      await pool.query('ALTER TABLE knowledge_files ADD COLUMN IF NOT EXISTS file_size BIGINT');
      await pool.query('ALTER TABLE knowledge_groups ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0');
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
        LIMIT 5
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

      // Feedback stats
      const posFeedbackRes = await pool.query('SELECT COUNT(*) FROM chat_messages WHERE feedback = 1');
      const negFeedbackRes = await pool.query('SELECT COUNT(*) FROM chat_messages WHERE feedback = -1');

      // Recent feedbacks (latest 10 - for scrolling)
      const recentFeedbacksRes = await pool.query(`
        SELECT m.id, m.content, m.feedback, m.created_at, u.user_name, u.email
        FROM chat_messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.feedback != 0
        ORDER BY m.created_at DESC
        LIMIT 10
      `);

      return {
        usersCount: parseInt(usersRes.rows[0].count),
        threadsCount: parseInt(threadsRes.rows[0].count),
        messagesCount: parseInt(messagesRes.rows[0].count),
        onlineCount: parseInt(onlineRes.rows[0].count),
        posFeedbackCount: parseInt(posFeedbackRes.rows[0].count),
        negFeedbackCount: parseInt(negFeedbackRes.rows[0].count),
        topUsers: topUsersRes.rows,
        weeklyMessages: weeklyRes.rows,
        recentFeedbacks: recentFeedbacksRes.rows,
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
    async updateFeedback(messageId: string, feedback: number): Promise<void> {
      await pool.query('UPDATE chat_messages SET feedback = $1 WHERE id = $2', [feedback, messageId]);
    },
    async getFeedbacks(limit: number = 20) {
      const res = await pool.query(`
        SELECT m.*, u.user_name, u.email
        FROM chat_messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.feedback != 0
        ORDER BY m.created_at DESC
        LIMIT $1
      `, [limit]);
      return res.rows;
    }
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
  },

  knowledge: {
    async createGroup(name: string, description: string = '', active: boolean = true) {
      const res = await pool.query(
        'INSERT INTO knowledge_groups (name, description, active) VALUES ($1, $2, $3) RETURNING *',
        [name, description, active]
      );
      return res.rows[0];
    },
    async getGroups(onlyActive: boolean = false) {
      const where = onlyActive ? 'WHERE active = TRUE' : '';
      const res = await pool.query(`SELECT * FROM knowledge_groups ${where} ORDER BY sort_order ASC, created_at DESC`);
      return res.rows;
    },
    async getGroupsWithCount(onlyActive: boolean = false) {
      const where = onlyActive ? 'WHERE g.active = TRUE' : '';
      const res = await pool.query(`
        SELECT g.*, COUNT(f.id)::int AS file_count
        FROM knowledge_groups g
        LEFT JOIN knowledge_files f ON f.group_id = g.id
        ${where}
        GROUP BY g.id
        ORDER BY g.sort_order ASC, g.created_at DESC
      `);
      return res.rows;
    },
    async deleteGroup(id: number) {
      await pool.query('DELETE FROM knowledge_groups WHERE id = $1', [id]);
    },
    async updateGroup(id: number, data: { name?: string; description?: string; active?: boolean }) {
      const fields = [];
      const values = [];
      let i = 1;
      if (data.name !== undefined) {
        fields.push(`name = $${i++}`);
        values.push(data.name);
      }
      if (data.description !== undefined) {
        fields.push(`description = $${i++}`);
        values.push(data.description);
      }
      if (data.active !== undefined) {
        fields.push(`active = $${i++}`);
        values.push(data.active);
      }
      if (fields.length === 0) return;
      values.push(id);
      await pool.query(`UPDATE knowledge_groups SET ${fields.join(', ')} WHERE id = $${i}`, values);
    },
    async reorderGroups(orders: { id: number; sort_order: number }[]) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const entry of orders) {
          await client.query('UPDATE knowledge_groups SET sort_order = $1 WHERE id = $2', [entry.sort_order, entry.id]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async addFile(group_id: number, file_name: string, file_path: string, file_size?: number) {
      const res = await pool.query(
        'INSERT INTO knowledge_files (group_id, file_name, file_path, file_size) VALUES ($1, $2, $3, $4) RETURNING *',
        [group_id, file_name, file_path, file_size || 0]
      );
      return res.rows[0];
    },
    async getFiles(group_id: number) {
      const res = await pool.query('SELECT * FROM knowledge_files WHERE group_id = $1 ORDER BY created_at DESC', [group_id]);
      return res.rows;
    },
    async deleteFile(id: number) {
      await pool.query('DELETE FROM knowledge_files WHERE id = $1', [id]);
    },
    async updateFileStatus(id: number, status: string, error_message: string | null = null) {
      if (error_message) {
        await pool.query('UPDATE knowledge_files SET status = $1, error_message = $2 WHERE id = $3', [status, error_message, id]);
      } else {
        await pool.query('UPDATE knowledge_files SET status = $1 WHERE id = $2', [status, id]);
      }
    },
    async updateFile(id: number, data: { file_name?: string; active?: boolean }) {
      const fields = [];
      const values = [];
      let i = 1;
      if (data.file_name !== undefined) {
        fields.push(`file_name = $${i++}`);
        values.push(data.file_name);
      }
      if (data.active !== undefined) {
        fields.push(`active = $${i++}`);
        values.push(data.active);
      }
      if (fields.length === 0) return;
      values.push(id);
      await pool.query(`UPDATE knowledge_files SET ${fields.join(', ')} WHERE id = $${i}`, values);
    }
  },

  logs: {
    async create(data: { user_id?: string; level: string; source: string; message: string; details?: string; content?: string }) {
      const res = await pool.query(
        'INSERT INTO system_logs (user_id, level, source, message, details, content) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [data.user_id || null, data.level, data.source, data.message, data.details || null, data.content || null]
      );
      return res.rows[0];
    },
    async findAll(limit: number = 100, offset: number = 0, filters: any = {}) {
      const where = [];
      const values = [];
      let i = 1;
      if (filters.level) { where.push(`level = $${i++}`); values.push(filters.level); }
      if (filters.source) { where.push(`source = $${i++}`); values.push(filters.source); }
      if (filters.user_id) { where.push(`user_id = $${i++}`); values.push(filters.user_id); }
      
      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const res = await pool.query(`
        SELECT l.*, u.user_name, u.email 
        FROM system_logs l
        LEFT JOIN users u ON l.user_id = u.id
        ${whereClause}
        ORDER BY l.created_at DESC
        LIMIT $${i++} OFFSET $${i++}
      `, [...values, limit, offset]);
      return res.rows;
    }
  }
};