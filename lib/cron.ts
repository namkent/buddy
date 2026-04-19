import cron from "node-cron";
import { dbConnection } from "./db";

/**
 * Biến toàn cục để đảm bảo cron job chỉ được đăng ký một lần
 * ngay cả khi Next.js reload trong quá trình phát triển (Fast Refresh)
 */
const globalForCron = global as unknown as { cronRegistered: boolean };

export function initCronJobs() {
  if (globalForCron.cronRegistered) {
    console.log("Cron jobs đã được đăng ký trước đó.");
    return;
  }

  console.log("Đang khởi tạo cron jobs...");

  /**
   * Chạy bảo trì hệ thống vào lúc 00:00 mỗi ngày
   * Cú pháp: giây(tùy chọn) phút giờ ngày tháng thứ
   */
  cron.schedule("0 0 * * *", async () => {
    console.log("[CRON] Bắt đầu chạy bảo trì hệ thống hàng ngày...");
    try {
      const result = await dbConnection.system.runMaintenance();
      console.log(`[CRON] Hoàn tất: ${result.summary}`);
    } catch (error) {
      console.error("[CRON] Lỗi khi chạy bảo trì:", error);
    }
  }, {
    timezone: "Asia/Ho_Chi_Minh" // Điều chỉnh theo múi giờ mong muốn
  });

  globalForCron.cronRegistered = true;
  console.log("Đã đăng ký cron job bảo trì hàng ngày vào lúc 00:00.");
}
