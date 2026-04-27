import cron from "node-cron";
import fs from "fs";
import path from "path";

const cleanupJob = () => {
  // Chạy vào lúc 0h mỗi ngày
  cron.schedule("0 0 * * *", () => {
    console.log("\x1b[33m[Job]\x1b[0m Starting cleanup of temporary files...");
    const tmpDir = path.resolve(process.env.STORAGE_DIR || "storage", "tmp");
    
    if (!fs.existsSync(tmpDir)) return;

    fs.readdir(tmpDir, (err, files) => {
      if (err) return console.error("Cleanup error:", err);

      files.forEach((file) => {
        const filePath = path.join(tmpDir, file);
        const stats = fs.statSync(filePath);
        
        // Xóa các file cũ hơn 24h
        const now = Date.now();
        const endTime = new Date(stats.mtime).getTime() + 24 * 60 * 60 * 1000;

        if (now > endTime) {
          fs.unlinkSync(filePath);
          console.log(`\x1b[33m[Job]\x1b[0m Deleted old file: ${file}`);
        }
      });
    });
  });
};

export default cleanupJob;
