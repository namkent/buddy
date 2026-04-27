type Task = () => Promise<any>;

class TaskQueue {
  private queue: Task[] = [];
  private running = 0;
  private concurrency: number;

  constructor(concurrency: number = 1) {
    this.concurrency = concurrency;
  }

  async add(task: Task): Promise<void> {
    this.queue.push(task);
    this.next();
  }

  private async next() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift();

    if (task) {
      try {
        await task();
      } catch (err) {
        console.error("Queue task error:", err);
      } finally {
        this.running--;
        this.next();
      }
    }
  }

  getPendingCount() {
    return this.queue.length;
  }
}

export const ragQueue = new TaskQueue(1); // Mặc định xử lý tuần tự từng file để tối ưu CPU
