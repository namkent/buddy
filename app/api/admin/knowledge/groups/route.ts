import { NextResponse } from 'next/server';
import { dbConnection } from '@/lib/db';
import { requireAdmin, errorResponse, successResponse, logAdminAction } from "@/lib/api-utils";

/**
 * [GET] Lấy danh sách các nhóm kiến thức (Kèm số lượng file trong mỗi nhóm)
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const groups = await dbConnection.knowledge.getGroupsWithCount();
    return successResponse({ groups });
  } catch (error: any) {
    console.error("Fetch knowledge groups fail:", error);
    return errorResponse("Không thể tải danh sách nhóm kiến thức", 500);
  }
}

/**
 * [POST] Tạo một nhóm kiến thức mới
 */
export async function POST(req: Request) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  try {
    const { name, description } = await req.json();
    if (!name) return errorResponse("Vui lòng nhập tên nhóm", 400);
    
    // Tạo nhóm trong DB
    const group = await dbConnection.knowledge.createGroup(name, description || "");
    
    // Ghi lại hành động của Admin
    await logAdminAction(admin!.userId, 'knowledge_base', `Đã tạo danh mục kiến thức mới: ${name}`, group);

    return successResponse({ group });
  } catch (error: any) {
    console.error("Create knowledge group fail:", error);
    return errorResponse("Lỗi hệ thống khi tạo nhóm kiến thức", 500);
  }
}
