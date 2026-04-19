export async function register() {
  /**
   * instrumentation.ts chạy trên cả môi trường Edge và Node.js.
   * Vì cron job yêu cầu môi trường Node.js (thư viện node-cron),
   * chúng ta phải kiểm tra runtime hiện tại.
   */
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initCronJobs } = await import("./lib/cron");
    initCronJobs();
  }
}
