import { NextResponse } from 'next/server';
import { dbConnection } from '@/lib/db';
import { requireAdmin, errorResponse, successResponse, logAdminAction } from "@/lib/api-utils";

/**
 * [POST] Đồng bộ hóa toàn bộ cơ sở dữ liệu kiến thức với Vector DB (ChromaDB)
 */
export async function POST() {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  try {
    const pythonUrl = process.env.RAG_SERVICE_URL || "http://localhost:8000";
    
    // Gọi Python service để thực hiện đồng bộ hóa vật lý
    const res = await fetch(`${pythonUrl}/rag/sync`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "RAG Sync failed");

    // Ghi lại log hành động đồng bộ
    await logAdminAction(admin!.userId, 'knowledge_base', `Đã hoàn thành đồng bộ hóa dữ liệu. Số tài liệu hợp lệ: ${data.valid_count}`, data);

    return successResponse(data);
  } catch (error: any) {
    console.error("Knowledge Sync fail:", error);
    return errorResponse(error.message || "Lỗi khi đồng bộ hóa dữ liệu", 500);
  }
}
