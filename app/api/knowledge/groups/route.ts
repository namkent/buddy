import { successResponse, errorResponse, requireAuth } from "@/lib/api-utils";
import { dbConnection } from "@/lib/db";

/**
 * [GET] Lấy danh sách các danh mục kiến thức khả dụng cho Chat UI
 * - Admin: Thấy toàn bộ danh mục.
 * - User/Guest: Chỉ thấy các danh mục có active = true.
 */
export async function GET() {
  try {
    const { user } = await requireAuth();
    if (!user) return errorResponse("Unauthorized", 401);

    const isAdmin = user.role === "admin";
    // Nếu là admin thì lấy tất cả, nếu không chỉ lấy danh mục active
    const groups = await dbConnection.knowledge.getGroups(!isAdmin);
    
    return successResponse({ groups });
  } catch (error: any) {
    console.error("Fetch available knowledge groups fail:", error);
    return errorResponse("Không thể tải danh sách danh mục kiến thức", 500);
  }
}
