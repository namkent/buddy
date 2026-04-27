import { Response } from "express";

class SSEManager {
  private connections: Map<string, Set<Response>> = new Map();
  private eventHistory: Map<string, any[]> = new Map();

  addConnection(groupId: string, res: Response) {
    if (!this.connections.has(groupId)) {
      this.connections.set(groupId, new Set());
    }
    this.connections.get(groupId)?.add(res);

    // Replay history for this group
    const history = this.eventHistory.get(groupId);
    if (history) {
      for (const event of history) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    }

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 30000);

    res.on('close', () => {
      clearInterval(keepAlive);
      this.removeConnection(groupId, res);
    });
  }

  removeConnection(groupId: string, res: Response) {
    const set = this.connections.get(groupId);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        this.connections.delete(groupId);
      }
    }
  }

  sendProgress(groupId: string, fileId: string, progress: number, status: string = 'processing', stage: string = '') {
    const event = { groupId, fileId, progress, status, stage };
    
    // Store in history
    if (!this.eventHistory.has(groupId)) {
      this.eventHistory.set(groupId, []);
    }
    const history = this.eventHistory.get(groupId)!;
    // Remove previous progress for same file to keep history clean
    const filteredHistory = history.filter(h => h.fileId !== fileId);
    filteredHistory.push(event);
    this.eventHistory.set(groupId, filteredHistory);

    // If complete or error, eventually clear history for this file
    if (status === 'completed' || status === 'error') {
      setTimeout(() => {
        const h = this.eventHistory.get(groupId);
        if (h) {
          this.eventHistory.set(groupId, h.filter(e => e.fileId !== fileId));
        }
      }, 10000);
    }

    const set = this.connections.get(groupId);
    if (!set) return;

    const data = JSON.stringify(event);
    const payload = `data: ${data}\n\n`;

    for (const res of set) {
      try {
        res.write(payload);
      } catch (err) {
        set.delete(res);
      }
    }
  }
}

export const sseManager = new SSEManager();
