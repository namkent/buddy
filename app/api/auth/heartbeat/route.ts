import { dbConnection } from "@/lib/db";
import { requireAuth, successResponse } from "@/lib/api-utils";

/**
 * [GET] Heartbeat Check: Được gọi mỗi 30 giây từ client để xác định người dùng đang online
 */
export async function GET() {
  const { error, user } = await requireAuth();
  if (error) return error;

  const userId = user?.userId;
  if (userId) {
    // Cập nhật thời gian hoạt động cuối cùng mà không làm nghẽn phản hồi (async)
    dbConnection.users.updateLastActive(userId).catch(() => {});
  }

  return successResponse({ ok: true });
}
