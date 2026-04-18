import { NextResponse } from 'next/server';
import { dbConnection } from '@/lib/db';
import { requireAdmin, errorResponse, successResponse, logAdminAction } from "@/lib/api-utils";

/**
 * [PUT] Cập nhật thứ tự sắp xếp của các nhóm kiến thức
 * Body: { orders: Array<{id: number, sort_order: number}> }
 */
export async function PUT(req: Request) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  try {
    const { orders } = await req.json();
    
    if (!orders || !Array.isArray(orders)) {
      return errorResponse("Dữ liệu sắp xếp không hợp lệ", 400);
    }
    
    // Cập nhật vào DB
    await dbConnection.knowledge.reorderGroups(orders);
    
    // Ghi log hành động
    await logAdminAction(admin!.userId, 'knowledge_base', `Đã cập nhật lại thứ tự sắp xếp của ${orders.length} danh mục kiến thức`);

    return successResponse({ success: true });
  } catch (error: any) {
    console.error("Reorder knowledge groups fail:", error);
    return errorResponse("Lỗi hệ thống khi cập nhật thứ tự", 500);
  }
}
