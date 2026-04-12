import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  if (!session) {
    redirect("/api/auth/signin?callbackUrl=/admin");
  } else if (role !== 'admin') {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-900 shadow-sm p-6 max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">403 Forbidden</h2>
          <p>Tài khoản của bạn không có đủ quyền truy cập trang Quản trị.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/10 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Trang Quản trị (Admin Dashboard)</h1>
        
        <div className="grid gap-6">
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Quản lý hệ thống</h2>
            <p className="text-muted-foreground">
              Chào mừng Admin! Hiện tại đây là trang khung (scaffold) để phát triển tiếp tính năng quản lý danh sách Người dùng, Role và Lịch sử trong các phase tới.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
