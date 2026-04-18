"use client";

import { useEffect, useRef, useState, use } from "react";
import {
  FolderOpen, FileText, UploadCloud,
  Loader2, Trash2, RefreshCw, ChevronLeft, Plus, XCircle, Clock, CheckCircle2, Files
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogTrigger
} from "@/components/ui/dialog";

type FileStatus = "pending" | "processing" | "completed" | "error" | "error_triggering";

const STATUS_CONFIG: Record<FileStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:           { label: "Chờ xử lý",    color: "text-amber-500",  icon: <Clock className="size-3.5" /> },
  processing:        { label: "Đang xử lý",   color: "text-blue-500",   icon: <Loader2 className="size-3.5 animate-spin" /> },
  completed:         { label: "Hoàn thành",   color: "text-green-500",  icon: <CheckCircle2 className="size-3.5" /> },
  error:             { label: "Lỗi xử lý",    color: "text-red-500",    icon: <XCircle className="size-3.5" /> },
  error_triggering:  { label: "Lỗi kết nối",  color: "text-red-500",    icon: <XCircle className="size-3.5" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as FileStatus] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function KnowledgeGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [group, setGroup] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "processing" | "done" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchGroupInfo();
    fetchFiles();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [id]);

  const fetchGroupInfo = async () => {
    try {
      const res = await fetch("/api/admin/knowledge/groups");
      const data = await res.json();
      if (data.groups) {
        const found = data.groups.find((g: any) => g.id.toString() === id);
        setGroup(found);
      }
    } catch { toast.error("Lỗi lấy thông tin nhóm"); }
  };

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/knowledge/groups/${id}/files`);
      const data = await res.json();
      if (data.files) {
        setFiles(data.files);
        const hasPending = data.files.some((f: any) => f.status === "pending" || f.status === "processing");
        if (hasPending) startPolling();
      }
    } catch { toast.error("Lỗi lấy danh sách file"); }
    finally { setLoading(false); }
  };

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/knowledge/groups/${id}/files`);
        const data = await res.json();
        if (data.files) {
          setFiles(data.files);
          const hasPending = data.files.some((f: any) => f.status === "pending" || f.status === "processing");
          if (!hasPending) {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
          }
        }
      } catch { /* silent */ }
    }, 3000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploadState("uploading");
    setUploadProgress(0);

    const progressInterval = setInterval(() => {
      setUploadProgress(prev => (prev >= 90 ? prev : prev + 5));
    }, 150);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("groupId", id);

    try {
      const res = await fetch("/api/admin/knowledge/files", { method: "POST", body: formData });
      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await res.json();
      if (data.file) {
        setUploadState("processing");
        toast.success("Upload thành công! Đang bắt đầu xử lý RAG...");
        setFiles(prev => [data.file, ...prev]);
        setSelectedFile(null);
        startPolling();
        setTimeout(() => {
          setUploadState("idle");
          setIsUploadOpen(false);
        }, 1000);
      } else {
        setUploadState("error");
        toast.error(data.error || "Upload thất bại");
      }
    } catch {
      setUploadState("error");
      toast.error("Lỗi kết nối server");
    }
  };

  const deleteFile = async (fileId: number) => {
    if (!confirm("Xóa tài liệu này sẽ xóa vĩnh viễn dữ liệu RAG và tệp vật lý. Tiếp tục?")) return;
    try {
      await fetch(`/api/admin/knowledge/files/${fileId}`, { method: "DELETE" });
      setFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success("Đã xóa tài liệu");
    } catch { toast.error("Lỗi xóa tài liệu"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/knowledge">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ChevronLeft className="size-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderOpen className="text-violet-500 size-6" />
            {group?.name || "Đang tải..."}
          </h1>
          <p className="text-sm text-zinc-500">{group?.description || "Quản trị tài liệu kiến thức"}</p>
        </div>

        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
              <UploadCloud className="size-4" />
              Thêm tài liệu
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tải lên tài liệu mới</DialogTitle>
            </DialogHeader>
            <div className="py-6 space-y-4">
               {!selectedFile ? (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 transition-colors">
                  <Plus className="size-10 text-zinc-300 mb-2" />
                  <p className="text-sm font-medium">Chọn file PDF, DOCX hoặc TXT</p>
                  <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileSelect} />
                </label>
               ) : (
                <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950">
                  <div className="flex items-center gap-3">
                    <FileText className="text-violet-500 size-8" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{selectedFile.name}</p>
                      <p className="text-xs text-zinc-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button onClick={() => setSelectedFile(null)} className="text-zinc-400 hover:text-red-500">
                      <XCircle className="size-5" />
                    </button>
                  </div>
                  
                  {uploadState !== "idle" && (
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span>{uploadState === "uploading" ? "Đang tải lên..." : "Đang xử lý RAG..."}</span>
                        <span>{Math.round(uploadProgress)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-violet-600 transition-all duration-300" 
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
               )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUploadOpen(false)}>Hủy</Button>
              <Button 
                onClick={handleUpload} 
                disabled={!selectedFile || uploadState !== "idle"}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                Bắt đầu Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {loading ? (
          <div className="flex justify-center p-20"><Loader2 className="animate-spin size-8 text-zinc-300" /></div>
        ) : files.length === 0 ? (
          <div className="text-center p-20 border-2 border-dashed border-zinc-100 dark:border-zinc-900 rounded-3xl">
             <FileText className="size-12 text-zinc-200 mx-auto mb-4" />
             <p className="text-zinc-500">Chưa có tài liệu nào trong nhóm này</p>
          </div>
        ) : (
          files.map(file => (
            <div key={file.id} className="group flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 rounded-2xl hover:border-violet-500/30 transition-all shadow-sm">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                 <div className="p-3 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-xl">
                    <FileText className="size-5" />
                 </div>
                 <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{file.file_name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <StatusBadge status={file.status} />
                      <span className="text-[10px] text-zinc-400">
                        {new Date(file.created_at).toLocaleString("vi-VN")}
                      </span>
                    </div>
                 </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-zinc-400 hover:text-violet-500"
                  asChild
                >
                  <a 
                    href={file.file_path.startsWith('http') ? file.file_path : `${process.env.NEXT_PUBLIC_FILE_SERVER_URL}${file.file_path}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    title="Xem tài liệu"
                  >
                    <FileText className="size-4" />
                  </a>
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteFile(file.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
