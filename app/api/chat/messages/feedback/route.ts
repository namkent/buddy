import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { dbConnection } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messageId, feedback, messageText } = await req.json();
    if (!messageId || feedback === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await dbConnection.messages.updateFeedback(messageId, feedback);

    // Tự động ghi log nếu là feedback xấu
    if (feedback === -1) {
      await dbConnection.logs.create({
        user_id: (session.user as any).id,
        level: "warn",
        source: "AI_FEEDBACK",
        message: `Người dùng đánh giá không tốt câu trả lời của AI`,
        details: `Message ID: ${messageId}`,
        content: messageText || "N/A"
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
