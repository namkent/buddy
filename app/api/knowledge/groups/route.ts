import { successResponse, errorResponse, requireAuth } from "@/lib/api-utils";
import { dbConnection } from "@/lib/db";

/**
 * [GET] Lấy danh sách các danh mục kiến thức khả dụng cho Chat UI
 * - Admin: Thấy toàn bộ danh mục.
 * - User/Guest: Chỉ thấy các danh mục có active = true.
 */
export async function GET(req: Request) {
  try {
    const { user } = await requireAuth();
    if (!user) return errorResponse("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const forceActiveOnly = searchParams.get("activeOnly") === "true";

    const isAdmin = user.role === "admin";
    // Nếu là admin thì lấy tất cả (trừ khi yêu cầu cụ thể activeOnly), nếu không chỉ lấy danh mục active
    const groups = await dbConnection.knowledge.getGroups(forceActiveOnly || !isAdmin);
    
    return successResponse({ groups });
  } catch (error: any) {
    console.error("Fetch available knowledge groups fail:", error);
    return errorResponse("Không thể tải danh sách danh mục kiến thức", 500);
  }
}
