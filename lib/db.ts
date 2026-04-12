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
      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        title TEXT DEFAULT 'New Chat',
        archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT REFERENCES chat_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  },

  threads: {
    async findAll(): Promise<ChatThread[]> {
      const res: QueryResult<ChatThread> = await pool.query('SELECT * FROM chat_threads ORDER BY created_at DESC');
      return res.rows;
    },
    async findById(id: string): Promise<ChatThread | null> {
      const res: QueryResult<ChatThread> = await pool.query('SELECT * FROM chat_threads WHERE id = $1', [id]);
      return res.rows[0] || null;
    },
    async create({ id }: { id: string }): Promise<ChatThread> {
      const res = await pool.query(
        'INSERT INTO chat_threads (id) VALUES ($1) ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id RETURNING *',
        [id]
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
          textContent = message.content
            .map((p: any) => {
              if (p.type === "text") return p.text;
              if (p.type === "reasoning") return `<think>\n${p.text}\n</think>\n`;
              return "";
            })
            .join("");
        } else {
          textContent = String(message.content);
        }

        await pool.query(
          'INSERT INTO chat_messages (id, thread_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)',
          [message.id, thread_id, message.role, textContent, message.createdAt || new Date()]
        );
      } catch (error) {
        console.error("DB Message Error:", error);
      }
    },
  }
};