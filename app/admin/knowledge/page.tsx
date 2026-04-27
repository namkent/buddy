"use client";

import { type FC, memo, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Readability } from "@mozilla/readability";
import TiptapEditor from "@/components/admin/tiptap-editor";
import DocumentViewer from "@/components/admin/document-viewer";
import {
  Plus, FolderOpen, Trash2, Loader2, Files, ChevronRight,
  FileText, UploadCloud, XCircle, Clock, CheckCircle2,
  Calendar, Search, Filter, Info, Mail, AlertCircle,
  FileCode, FileJson, FileType, FileSignature, FileArchive, Edit2,
  RefreshCw, GripVertical
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { AdminLogsDrawer } from "@/components/admin/logs-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogTrigger
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type FileStatus = "pending" | "processing" | "completed" | "error" | "error_triggering";

const STATUS_CONFIG: Record<FileStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", color: "text-amber-600", icon: <Clock className="size-3.5" /> },
  processing: { label: "Processing", color: "text-blue-600", icon: <Loader2 className="size-3.5 animate-spin" /> },
  completed: { label: "Completed", color: "text-indigo-600", icon: <CheckCircle2 className="size-3.5" /> },
  error: { label: "System Error", color: "text-red-600", icon: <XCircle className="size-3.5" /> },
  error_triggering: { label: "Connection Error", color: "text-red-600", icon: <XCircle className="size-3.5" /> },
};

export default function KnowledgeBasePage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  // Files state
  const [files, setFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileSearch, setFileSearch] = useState("");

  // Create Group state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Manual content state
  const [isContentOpen, setIsContentOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [savingContent, setSavingContent] = useState(false);

  // Rename states
  const [editingGroup, setEditingGroup] = useState<any | null>(null);
  const [renamingGroupName, setRenamingGroupName] = useState("");
  const [renamingGroupDesc, setRenamingGroupDesc] = useState("");

  const [editingFile, setEditingFile] = useState<any | null>(null);
  const [renamingFileTitle, setRenamingFileTitle] = useState("");

  // Logs Drawer state
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  
  // Document Viewer states
  const [viewingFile, setViewingFile] = useState<any | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  
  const [retryingFileId, setRetryingFileId] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Crawl URL state
  const [isCrawlOpen, setIsCrawlOpen] = useState(false);
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawling, setCrawling] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const selectedGroupRef = useRef<number | null>(null);

  useEffect(() => {
    selectedGroupRef.current = selectedGroupId;
  }, [selectedGroupId]);

  useEffect(() => {
    setIsMounted(true);
    fetchGroups();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      fetchFiles(selectedGroupId);
      setupSSE(selectedGroupId);
    } else {
      setFiles([]);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    }
  }, [selectedGroupId]);

  const fetchGroups = async () => {
    try {
      const res = await fetch("/api/admin/knowledge/groups");
      const data = await res.json();
      if (data.groups) {
        setGroups(data.groups);
        setSelectedGroupId(current => {
          if (!current && data.groups.length > 0) {
            return data.groups[0].id;
          }
          return current;
        });
      }
    } catch { toast.error("Failed to load categories"); }
    finally { setLoadingGroups(false); }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(groups);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setGroups(items);

    // Chuẩn bị dữ liệu cập nhật sort_order dựa trên index mới
    const orders = items.map((item, index) => ({ id: item.id, sort_order: index }));

    try {
      const res = await fetch("/api/admin/knowledge/groups/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
      if (!res.ok) throw new Error();
      toast.success("Order updated");
    } catch {
      toast.error("Failed to save order");
      fetchGroups(); // Revert
    }
  };

  const fetchFiles = async (groupId: number) => {
    setLoadingFiles(true);
    try {
      const res = await fetch(`/api/admin/knowledge/groups/${groupId}/files`);
      const data = await res.json();
      if (data.files) {
        setFiles(data.files);
        checkAndStartPolling(data.files);
      }
    } catch { toast.error("Failed to load documents"); }
    finally { setLoadingFiles(false); }
  };

  const setupSSE = (groupId: number) => {
    if (sseRef.current) {
      sseRef.current.close();
    }

    const aiServiceUrl = process.env.NEXT_PUBLIC_AI_SERVICE_URL || "http://localhost:3005";
    const sse = new EventSource(`${aiServiceUrl}/v1/rag/events/${groupId}`);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.fileId) {
          setFiles(prev => prev.map(f => 
            String(f.id) === String(data.fileId) 
              ? { ...f, progress: data.progress, status: data.status, stage: data.stage } 
              : f
          ));
          
          if (data.status === 'completed' || data.status === 'error') {
            fetchGroups(); // Refresh counts
          }
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    sse.onerror = () => {
      console.warn("SSE connection lost, falling back to polling if needed.");
      sse.close();
    };
  };

  const checkAndStartPolling = (currentFiles: any[]) => {
    const hasPending = currentFiles.some(f => f.status === "pending" || f.status === "processing");
    // Giữ polling như một fallback cho các thay đổi khác hoặc nếu SSE lỗi
    if (hasPending) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(async () => {
        const currentId = selectedGroupRef.current;
        if (!currentId) return;
        const res = await fetch(`/api/admin/knowledge/groups/${currentId}/files`);
        const data = await res.json();
        if (data.files) {
          setFiles(prev => {
            // Merge polling data with current state to preserve SSE progress
            return data.files.map((newFile: any) => {
              const existingFile = prev.find(f => f.id === newFile.id);
              if (existingFile && existingFile.status === 'processing' && newFile.status === 'processing') {
                // Preserve SSE state for active processing
                return {
                  ...newFile,
                  progress: existingFile.progress > newFile.progress ? existingFile.progress : newFile.progress,
                  stage: existingFile.stage || newFile.stage
                };
              }
              return newFile;
            });
          });
          if (!data.files.some((f: any) => f.status === "pending" || f.status === "processing")) {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            fetchGroups(); // Refresh group counts
          }
        }
      }, 5000); // Polling chậm hơn khi có SSE
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/knowledge/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName, description: newGroupDesc, active: true }),
      });
      const data = await res.json();
      if (data.group) {
        setGroups([{ ...data.group, file_count: 0 }, ...groups]);
        setSelectedGroupId(data.group.id);
        setIsCreateOpen(false);
        setNewGroupName("");
        setNewGroupDesc("");
        toast.success("New category created successfully");
      }
    } catch { toast.error("Failed to create category"); }
    finally { setCreating(false); }
  };

  const handleDeleteGroup = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Deleting this category will erase all associated RAG data. Continue?")) return;
    try {
      await fetch(`/api/admin/knowledge/groups/${id}`, { method: "DELETE" });
      setGroups(prev => prev.filter(g => g.id !== id));
      if (selectedGroupId === id) setSelectedGroupId(groups.find(g => g.id !== id)?.id || null);
      toast.success("Category deleted");
    } catch { toast.error("Failed to delete category"); }
  };

  // Helper function to format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  /**
   * Chuyển một URL ảnh sang Base64 thông qua <img> + <canvas>.
   * Phương pháp này hoạt động tốt hơn fetch() vì trình duyệt cho phép
   * thẻ <img> tải ảnh cross-origin mà không cần CORS headers.
   */
  const imageUrlToBase64 = (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Thử tải với CORS trước

      const tryCanvas = (imgEl: HTMLImageElement) => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = imgEl.naturalWidth;
          canvas.height = imgEl.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(imgEl, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl);
        } catch {
          resolve(null); // Canvas bị tainted (CORS chặn đọc pixel)
        }
      };

      img.onload = () => tryCanvas(img);

      img.onerror = () => {
        // Nếu CORS anonymous bị chặn, thử lại không có crossOrigin
        const img2 = new Image();
        img2.onload = () => tryCanvas(img2);
        img2.onerror = () => {
          console.warn('[Crawl] Image failed to load:', url);
          resolve(null);
        };
        img2.src = url;
      };

      img.src = url;
    });
  };

  const convertImagesToBase64 = async (html: string, baseUrl?: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const images = Array.from(doc.querySelectorAll('img'));
    
    const imagePromises = images.map(async (img) => {
      // === Bước 1: Tìm URL ảnh thật (xử lý lazy-loading) ===
      let src = img.getAttribute('data-src')
        || img.getAttribute('data-lazy-src')
        || img.getAttribute('data-original')
        || img.getAttribute('data-actualsrc')
        || null;

      // Thử lấy từ srcset (lấy ảnh có độ phân giải cao nhất)
      if (!src) {
        const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset');
        if (srcset) {
          const candidates = srcset.split(',').map(s => s.trim().split(/\s+/));
          // Sắp xếp theo kích thước giảm dần, lấy URL lớn nhất
          candidates.sort((a, b) => {
            const sizeA = parseInt(a[1] || '0');
            const sizeB = parseInt(b[1] || '0');
            return sizeB - sizeA;
          });
          src = candidates[0]?.[0] || null;
        }
      }

      // Nếu không có lazy-loading attr, dùng src gốc
      if (!src) {
        src = img.getAttribute('src');
      }

      if (!src) return;

      // Bỏ qua SVG placeholder (ảnh giả dạng data:image/svg+xml)
      if (src.startsWith('data:image/svg+xml')) return;
      // Bỏ qua ảnh Base64 đã có sẵn
      if (src.startsWith('data:')) return;

      // === Bước 2: Resolve URL tương đối ===
      if (baseUrl && !src.startsWith('http') && !src.startsWith('//')) {
        try {
          src = new URL(src, baseUrl).href;
        } catch {
          // Fallback
        }
      }
      if (src.startsWith('//')) {
        src = 'https:' + src;
      }

      if (!src.startsWith('http')) return;

      // === Bước 3: Chuyển sang Base64 ===
      // Ưu tiên: Dùng <img> + <canvas>
      const base64 = await imageUrlToBase64(src);
      if (base64 && base64 !== 'data:,' && !base64.startsWith('data:image/svg+xml')) {
        img.setAttribute('src', base64);
        // Xóa các thuộc tính lazy-loading để tránh nhầm lẫn
        img.removeAttribute('data-src');
        img.removeAttribute('data-lazy-src');
        img.removeAttribute('data-original');
        img.removeAttribute('data-srcset');
        img.removeAttribute('srcset');
        img.removeAttribute('loading');
        return;
      }

      // Fallback: Dùng fetch
      try {
        const response = await fetch(src, { mode: 'cors' });
        const blob = await response.blob();
        // Bỏ qua nếu fetch trả về SVG
        if (blob.type.includes('svg')) return;
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        img.setAttribute('src', dataUrl);
        img.removeAttribute('data-src');
        img.removeAttribute('srcset');
      } catch (err) {
        console.warn('[Crawl] Could not convert image to Base64:', src);
      }
    });

    await Promise.all(imagePromises);
    return doc.body.innerHTML;
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedGroupId) return;
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("groupId", selectedGroupId.toString());

    try {
      const xhr = new XMLHttpRequest();
      
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        });

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(xhr.responseText));
          }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("POST", "/api/admin/knowledge/files");
        xhr.send(formData);
      });

      const data: any = await uploadPromise;
      if (data.file) {
        setFiles(prev => [data.file, ...prev]);
        setSelectedFile(null);
        setIsUploadOpen(false);
        checkAndStartPolling([data.file, ...files]);
        toast.success("Upload successful");
      }
    } catch (err) { 
      console.error(err);
      toast.error("Failed to upload file"); 
    } finally { 
      setUploading(false); 
      setUploadProgress(0);
    }
  };

  const handleSaveContent = async () => {
    if (!manualTitle.trim() || !manualContent.trim() || !selectedGroupId) {
      toast.error("Please provide both title and content");
      return;
    }
    setSavingContent(true);
    try {
      // Chuyển đổi ảnh internet sang Base64 để hỗ trợ server offline
      const processedContent = await convertImagesToBase64(manualContent);
      
      const res = await fetch("/api/admin/knowledge/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: manualTitle,
          content: processedContent,
          groupId: selectedGroupId
        }),
      });
      const data = await res.json();
      if (data.file) {
        setFiles(prev => [data.file, ...prev]);
        setIsContentOpen(false);
        setManualTitle("");
        setManualContent("");
        checkAndStartPolling([data.file, ...files]);
        toast.success("Content saved and processing started");
      }
    } catch { toast.error("Failed to save content"); }
    finally { setSavingContent(false); }
  };

  const handleCrawl = async () => {
    if (!crawlUrl.trim() || !selectedGroupId) return;

    // === Bước 0: Decode & Validate URL ===
    let decodedUrl = crawlUrl.trim();

    // Decode URL nếu đã bị encode (ví dụ: %3A → :, %2F → /)
    try {
      decodedUrl = decodeURIComponent(decodedUrl);
    } catch {
      // Nếu decodeURIComponent thất bại, giữ nguyên URL gốc
    }

    // Tự động thêm https:// nếu user quên ghi protocol
    if (!/^https?:\/\//i.test(decodedUrl)) {
      decodedUrl = 'https://' + decodedUrl;
    }

    // Kiểm tra URL hợp lệ
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(decodedUrl);
    } catch {
      toast.error('URL không hợp lệ. Vui lòng kiểm tra lại địa chỉ.');
      return;
    }

    // Chỉ chấp nhận http và https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      toast.error('Chỉ hỗ trợ URL dạng http:// hoặc https://');
      return;
    }

    // Kiểm tra hostname có tồn tại
    if (!parsedUrl.hostname || parsedUrl.hostname.length < 2) {
      toast.error('URL thiếu tên miền (hostname). Ví dụ: https://example.com/article');
      return;
    }

    setCrawling(true);
    try {
      // 1. Fetch HTML qua trình duyệt (Lưu ý: Có thể bị chặn bởi CORS nếu site không cho phép)
      const res = await fetch(decodedUrl);
      if (!res.ok) throw new Error(`Không thể truy cập URL (HTTP ${res.status}). Có thể bị chặn bởi CORS.`);
      const html = await res.text();

      // 2. Phân tích nội dung sạch bằng Readability
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // Inject base URL để browser resolve relative paths đúng
      const baseEl = doc.createElement('base');
      baseEl.href = decodedUrl;
      doc.head.appendChild(baseEl);

      const reader = new Readability(doc);
      const article = reader.parse();

      if (!article) {
        throw new Error("Không thể trích xuất nội dung từ URL này. Trang có thể không có nội dung bài viết.");
      }

      // 3. Xử lý ảnh sang Base64 (có hỗ trợ URL tương đối)
      const processedHtml = await convertImagesToBase64(article.content || "", decodedUrl);

      // 4. Chuyển kết quả vào trình soạn thảo thủ công
      setManualTitle(article.title || "Crawled Content");
      setManualContent(processedHtml);
      
      setIsCrawlOpen(false);
      setIsContentOpen(true); // Mở trình soạn thảo để review
      toast.success("Đã crawl thành công! Vui lòng kiểm tra nội dung trước khi lưu.");
      setCrawlUrl("");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Crawl thất bại. Hãy thử copy nội dung thủ công nếu CORS bị chặn.");
    } finally {
      setCrawling(false);
    }
  };

  const handleUpdateFile = async (id: number, data: { file_name?: string, active?: boolean }) => {
    try {
      const res = await fetch(`/api/admin/knowledge/files/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, ...data } : f));
        if (data.active !== undefined) {
          toast.success(data.active ? "Document enabled" : "Document disabled");
        } else {
          toast.success("Document updated");
          setEditingFile(null);
        }
      }
    } catch { toast.error("Failed to update document"); }
  };

  const handleUpdateGroup = async (id?: number, statusUpdate?: boolean) => {
    const targetId = id || editingGroup?.id;
    if (!targetId) return;

    // Nếu là cập nhật nhanh trạng thái active (nút gạt)
    if (statusUpdate !== undefined) {
      try {
        const res = await fetch(`/api/admin/knowledge/groups/${targetId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: statusUpdate }),
        });
        if (res.ok) {
          setGroups(prev => prev.map(g => g.id === targetId ? { ...g, active: statusUpdate } : g));
          toast.success(statusUpdate ? "Category visible to users" : "Category hidden from users");
        }
      } catch { toast.error("Failed to update status"); }
      return;
    }

    // Cập nhật thông tin qua Dialog
    if (!renamingGroupName.trim()) return;
    try {
      const res = await fetch(`/api/admin/knowledge/groups/${targetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renamingGroupName, description: renamingGroupDesc }),
      });
      if (res.ok) {
        setGroups(prev => prev.map(g => g.id === targetId ? { ...g, name: renamingGroupName, description: renamingGroupDesc } : g));
        setEditingGroup(null);
        toast.success("Category updated");
      }
    } catch { toast.error("Failed to update category"); }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': return <FileArchive className="size-4 text-red-500 shrink-0" />;
      case 'html': case 'htm': return <FileCode className="size-4 text-blue-500 shrink-0" />;
      case 'doc': case 'docx': return <FileType className="size-4 text-indigo-500 shrink-0" />;
      case 'txt': return <FileSignature className="size-4 text-zinc-500 shrink-0" />;
      case 'json': return <FileJson className="size-4 text-amber-500 shrink-0" />;
      default: return <FileText className="size-4 text-indigo-500 shrink-0" />;
    }
  };

  const deleteFile = async (fileId: number) => {
    if (!confirm("Permanently delete this document?")) return;
    try {
      await fetch(`/api/admin/knowledge/files/${fileId}`, { method: "DELETE" });
      setFiles(prev => prev.filter(f => f.id !== fileId));
      fetchGroups(); // Refresh count
      toast.success("Document deleted");
    } catch { toast.error("Failed to delete document"); }
  };

  const handleRetryRag = async (fileId: number) => {
    setRetryingFileId(fileId);
    try {
      const res = await fetch(`/api/admin/knowledge/files/${fileId}/retry`, { method: "POST" });
      if (res.ok) {
        toast.success("RAG processing restarted");
        // Update local state to pending
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'pending', error_message: null } : f));
        checkAndStartPolling(files.map(f => f.id === fileId ? { ...f, status: 'pending' } : f));
      } else {
        toast.error("Failed to restart RAG");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRetryingFileId(null);
    }
  };

  const handleSyncDatabase = async () => {
    if (!confirm("This will synchronize the Vector Database with the file records. It will remove orphaned vectors. Continue?")) return;
    setIsSyncing(true);
    try {
      const res = await fetch("/api/admin/knowledge/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Sync complete! ${data.valid_count} documents verified.`);
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch {
      toast.error("Network error during sync");
    } finally {
      setIsSyncing(false);
    }
  };

  const openErrorLog = (file: any) => {
    setSelectedLog({
      id: file.id, // Dummy ID or map to actual log
      level: 'error',
      source: 'knowledge_base',
      message: `Lỗi xử lý tài liệu: ${file.file_name}`,
      details: file.error_message || "Không có chi tiết lỗi.",
      content: `File: ${file.file_name} (ID: ${file.id})`,
      created_at: file.created_at
    });
    setLogDrawerOpen(true);
  };

  const filteredFiles = files.filter(f =>
    f.file_name.toLowerCase().includes(fileSearch.toLowerCase())
  );

  const selectedGroup = groups.find(g => Number(g.id) === Number(selectedGroupId));

  return (
    <div className="flex flex-col h-[calc(100dvh-10rem)] space-y-6 max-w-[1600px] mx-auto w-full">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1">Knowledge Base</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Manage enterprise knowledge, extract RAG data, and process multi-media content.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncDatabase}
            disabled={isSyncing}
            className="gap-2 border-zinc-200 dark:border-white/5 shadow-sm text-zinc-500 hover:text-indigo-500"
            title="Clean up orphaned vectors in database"
          >
            <RefreshCw className={cn("size-3.5", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing..." : "Sync DB"}
          </Button>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 border-zinc-300 dark:border-white/10 shadow-sm transition-colors">
                <Plus className="size-3.5" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Knowledge Category</DialogTitle>
                <DialogDescription>Add a new category to organize your knowledge base documents.</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Category Name</label>
                  <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Technical Process" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-xs">Description</label>
                  <Input value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="Short description for RAG search..." className="text-sm" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleCreateGroup} disabled={creating} className="bg-indigo-600 hover:bg-indigo-700">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Rename Category</DialogTitle>
                <DialogDescription>Update the name and description for this knowledge category.</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Category Name</label>
                  <Input value={renamingGroupName} onChange={e => setRenamingGroupName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-xs">Description</label>
                  <Input value={renamingGroupDesc} onChange={e => setRenamingGroupDesc(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setEditingGroup(null)}>Cancel</Button>
                <Button size="sm" onClick={() => handleUpdateGroup()} className="bg-indigo-600">Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!editingFile} onOpenChange={(open) => !open && setEditingFile(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Rename Document</DialogTitle>
                <DialogDescription>Enter a new name for this knowledge document.</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">New Name</label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={renamingFileTitle}
                      onChange={e => setRenamingFileTitle(e.target.value)}
                      className="flex-1"
                    />
                    <Badge variant="outline" className="shrink-0 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 font-mono">
                      .{editingFile?.file_name.split('.').pop()}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-zinc-400">Extension is preserved automatically.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setEditingFile(null)}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const ext = editingFile.file_name.split('.').pop();
                    handleUpdateFile(editingFile.id, { file_name: `${renamingFileTitle}.${ext}` });
                  }}
                  className="bg-indigo-600"
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={isCrawlOpen} onOpenChange={setIsCrawlOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!selectedGroupId} className="border-zinc-300 dark:border-white/10 shadow-sm transition-colors gap-2">
                <Search className="size-3.5" />
                Crawl URL
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Crawl Content from URL</DialogTitle>
                <DialogDescription asChild>
                  <div>
                    Enter a URL to automatically extract its main content and images.
                    <div className="mt-2 text-amber-600 dark:text-amber-400 font-medium text-xs">Note: Target site must allow CORS or use a CORS-bypass extension.</div>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Target URL</label>
                  <Input 
                    value={crawlUrl} 
                    onChange={e => setCrawlUrl(e.target.value)} 
                    placeholder="https://example.com/article" 
                    onKeyDown={(e) => e.key === 'Enter' && handleCrawl()}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setIsCrawlOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleCrawl} disabled={crawling || !crawlUrl.trim()} className="bg-indigo-600">
                  {crawling ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-3.5" />}
                  Crawl Now
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isContentOpen} onOpenChange={setIsContentOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!selectedGroupId} className="border-zinc-300 dark:border-white/10 shadow-sm transition-colors gap-2">
                <FileText className="size-3.5" />
                Input Content
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[75vw] w-full h-[75vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Input Manual Content</DialogTitle>
                <DialogDescription>Type or paste your content below. You can also include images and links.</DialogDescription>
              </DialogHeader>
              <div className="flex-1 min-h-0 flex flex-col space-y-4 py-4 px-1 overflow-hidden">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Document Title</label>
                  <Input
                    value={manualTitle}
                    onChange={e => setManualTitle(e.target.value)}
                    placeholder="e.g. System Troubleshooting Guide"
                  />
                </div>
                <div className="flex-1 flex flex-col space-y-1.5 min-h-0">
                  <label className="text-sm font-medium">Content</label>
                  <TiptapEditor
                    content={manualContent}
                    onChange={setManualContent}
                    placeholder="Type or paste your content here..."
                  />
                </div>
              </div>
              <DialogFooter className="pt-2">
                <Button variant="ghost" size="sm" onClick={() => setIsContentOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveContent} disabled={savingContent || !manualContent.trim()} className="bg-indigo-600">
                  {savingContent && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save Content
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!selectedGroupId} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm gap-2">
                <UploadCloud className="size-3.5" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Upload to [{selectedGroup?.name}]</DialogTitle>
                <DialogDescription>Select a PDF, Word or Text file to upload to this category.</DialogDescription>
              </DialogHeader>
              <div className="py-8 text-center overflow-hidden">
                {!selectedFile ? (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 transition-all group">
                    <Plus className="size-10 text-zinc-300 group-hover:text-indigo-500 mb-2" />
                    <span className="text-xs font-medium text-zinc-500">Click to select PDF, Word or Txt file</span>
                    <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
                  </label>
                ) : (
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-left flex items-center gap-3 overflow-hidden">
                    <div className="bg-indigo-500/10 p-2 rounded-lg shrink-0">
                      <FileText className="size-6 text-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-semibold text-sm truncate w-full" title={selectedFile.name}>{selectedFile.name}</p>
                      <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-tight mt-0.5">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full hover:bg-red-500/10 hover:text-red-500 shrink-0"
                      onClick={() => setSelectedFile(null)}
                    >
                      <XCircle className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleUpload} disabled={!selectedFile || !selectedGroupId || uploading} className="bg-indigo-600 w-24">
                  {uploading ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold">{uploadProgress}%</span>
                      <Loader2 className="size-3 animate-spin" />
                    </div>
                  ) : "Upload"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Split Content */}
      <div className="flex flex-1 gap-6 min-h-0 overflow-hidden p-1">
        {/* Left: Groups Table */}
        <div className="w-[400px] flex flex-col border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-xl overflow-hidden shadow-sm">
          <div className="h-12 bg-zinc-100/50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-white/10 px-4 flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">CATEGORY</span>
            <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-600 border-none text-[12px] h-6 pl-4 pr-4 font-bold">{groups.length}</Badge>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar">
            {!isMounted ? (
              <Table>
                <TableBody>
                  {groups.map(group => (
                    <TableRow key={group.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer">
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center gap-7 pl-6">
                          <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            <FolderOpen className="size-4" />
                          </div>
                          <div className="flex-1"><span className="font-semibold text-sm">{group.name}</span></div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <DragDropContext onDragEnd={onDragEnd}>
                <Table>
                  <Droppable droppableId="groups">
                    {(provided) => (
                      <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                        {loadingGroups ? (
                          <TableRow><TableCell className="text-center py-10 text-xs text-zinc-500">Loading...</TableCell></TableRow>
                        ) : groups.map((group, index) => (
                          <Draggable key={group.id} draggableId={group.id.toString()} index={index}>
                            {(provided, snapshot) => (
                              <TableRow
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                onClick={() => setSelectedGroupId(group.id)}
                                className={cn(
                                  "cursor-pointer transition-colors group",
                                  Number(selectedGroupId) === Number(group.id) ? "bg-indigo-500/5 dark:bg-indigo-500/10" : "hover:bg-zinc-50 dark:hover:bg-white/5",
                                  snapshot.isDragging && "bg-zinc-100 dark:bg-zinc-800 shadow-lg opacity-80"
                                )}
                              >
                                <TableCell
                                  className={cn(
                                    "py-3 px-4 transition-all",
                                    Number(selectedGroupId) === Number(group.id) && "shadow-[inset_3px_0_0_0_#8b5cf6]"
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    {/* Drag Handle */}
                                    <div {...provided.dragHandleProps} className="text-zinc-300 hover:text-zinc-500 cursor-grab active:cursor-grabbing p-1">
                                      <GripVertical className="size-4" />
                                    </div>

                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <div className={cn("p-2 rounded-lg transition-colors flex items-center justify-center shrink-0", Number(selectedGroupId) === Number(group.id) ? "bg-indigo-500 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500")}>
                                        <FolderOpen className={cn("size-4", !group.active && "opacity-40")} />
                                      </div>
                                      <div className="min-w-0 flex-1 flex flex-col justify-center">
                                        <div className="flex items-center gap-2">
                                          <span className={cn("font-semibold text-sm truncate", !group.active && "text-zinc-400")}>{group.name}</span>
                                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4 font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-none shrink-0">
                                            {group.file_count || 0}
                                          </Badge>
                                        </div>
                                        <p className={cn("text-xs truncate mt-0.5 font-normal leading-tight", group.active ? "text-zinc-400" : "text-zinc-300")}>{group.description || "No description"}</p>
                                      </div>
                                      <div className="flex items-center gap-0.5 shrink-0 transition-opacity">
                                        <div className="flex items-center px-1">
                                          <Switch
                                            checked={group.active}
                                            onCheckedChange={(val) => handleUpdateGroup(group.id, val)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="scale-75 data-[state=checked]:bg-indigo-500"
                                          />
                                        </div>
                                        <Button
                                          variant="ghost" size="icon"
                                          className="size-7 text-zinc-400 hover:text-indigo-500"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingGroup(group);
                                            setRenamingGroupName(group.name);
                                            setRenamingGroupDesc(group.description || "");
                                          }}
                                        >
                                          <Edit2 className="size-3" />
                                        </Button>
                                        <Button
                                          variant="ghost" size="icon"
                                          className="size-7 text-zinc-400 hover:text-red-500"
                                          onClick={(e) => handleDeleteGroup(e, group.id)}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </TableBody>
                    )}
                  </Droppable>
                </Table>
              </DragDropContext>
            )}
          </div>
        </div>

        {/* Right: Files Table */}
        <div className="flex-1 flex flex-col border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-xl overflow-hidden shadow-sm">
          {/* Files List Header - Action Bar (Simplified) */}
          <div className="h-12 bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-white/10 px-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mr-2">DOCUMENTS</span>
              {selectedGroup && <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-600 border-none pl-4 pr-4 font-bold text-[12px] uppercase">{selectedGroup.name}</Badge>}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-zinc-400" />
                <Input
                  placeholder="Search documents..."
                  className="pl-8 h-8 w-48 text-[13px] bg-white/50 dark:bg-white/5 border-zinc-200 dark:border-white/10"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            {/* Table Header (Fixed) */}
            <div className="bg-zinc-100/50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-white/10 shrink-0">
              <table className="w-full table-fixed text-sm border-separate border-spacing-0">
                <thead className="text-zinc-500 dark:text-zinc-400 uppercase text-sm tracking-wider">
                  <tr className="h-12">
                    <th className="px-4 font-bold text-left">File name</th>
                    <th className="w-[100px] px-4 font-bold text-center">Type</th>
                    <th className="w-[100px] px-4 font-bold text-center">Size</th>
                    <th className="w-[180px] px-4 font-bold text-center">Status</th>
                    <th className="w-[100px] px-4 font-bold text-center">Active</th>
                    <th className="w-[180px] px-4 font-bold text-center">Action</th>
                  </tr>
                </thead>
              </table>
            </div>

            {/* Table Body (Scrollable) */}
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full table-fixed text-sm border-separate border-spacing-0">
                <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                  {!selectedGroupId ? (
                    <tr>
                      <td colSpan={6} className="text-center py-20 text-sm text-zinc-400 italic">
                        Select a category to start
                      </td>
                    </tr>
                  ) : loadingFiles ? (
                    <tr>
                      <td colSpan={6} className="text-center py-20">
                        <Loader2 className="size-6 animate-spin mx-auto text-zinc-300" />
                      </td>
                    </tr>
                  ) : filteredFiles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-20 text-sm text-zinc-500 italic">
                        No documents found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredFiles.map(file => {
                      const status = STATUS_CONFIG[file.status as FileStatus] || STATUS_CONFIG.pending;
                      return (
                        <tr key={file.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors h-14 border-b border-zinc-100 dark:border-white/5">
                          <td className="px-4 text-left">
                            <div className="flex items-center gap-3">
                              <div className={cn("size-8 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0", !file.active && "opacity-40")}>
                                {getFileIcon(file.file_name)}
                              </div>
                              <div className="min-w-0">
                                <button
                                  className={cn("font-semibold text-zinc-900 dark:text-zinc-100 truncate text-left hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors cursor-pointer block max-w-full", !file.active && "text-zinc-400")}
                                  title={`Xem: ${file.file_name}`}
                                  onClick={() => {
                                    setViewingFile(file);
                                    setIsViewOpen(true);
                                  }}
                                >
                                  {file.file_name}
                                </button>
                                <p className="text-[11px] text-zinc-500">
                                  {new Date(file.created_at).toLocaleDateString()} {new Date(file.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="w-[100px] px-4 text-center">
                            <Badge variant="outline" className={cn("text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 border-none uppercase", !file.active && "opacity-40")}>
                              {file.file_name.split('.').pop()}
                            </Badge>
                          </td>
                          <td className={cn("w-[100px] px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 text-center", !file.active && "opacity-40")}>
                            {file.file_size ? (
                              Number(file.file_size) >= 1024 * 1024
                                ? `${(Number(file.file_size) / (1024 * 1024)).toFixed(1)} MB`
                                : `${(Number(file.file_size) / 1024).toFixed(1)} KB`
                            ) : "0 KB"}
                          </td>
                          <td className="w-[180px] px-4">
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              <div
                                className={cn(
                                  "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-full transition-all",
                                  status.color,
                                  file.status === "error" ? "cursor-pointer hover:bg-red-500/10 ring-1 ring-inset ring-red-500/20" : "cursor-default",
                                  !file.active && "opacity-40"
                                )}
                                onClick={(e) => {
                                  if (file.status === "error") {
                                    e.stopPropagation();
                                    openErrorLog(file);
                                  }
                                }}
                              >
                                {status.icon}
                                {status.label}
                                {file.status === "error" && <Info className="size-3 ml-0.5" />}
                              </div>

                              {/* Progress Stage & Bar for Processing state */}
                              {file.status === "processing" && (
                                <div className="flex flex-col items-center w-full mt-0.5">
                                  {file.stage && (
                                    <span className="text-[9px] text-zinc-400 font-medium mb-0.5 animate-pulse">
                                      {file.stage}
                                    </span>
                                  )}
                                  <div className="w-full max-w-[140px] flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-blue-500 transition-all duration-500" 
                                        style={{ width: `${file.progress || 0}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-blue-600 font-bold shrink-0">{file.progress || 0}%</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="w-[100px] px-4 text-center">
                            <div className="flex justify-center">
                              <Switch
                                checked={file.active !== false}
                                onCheckedChange={(val) => handleUpdateFile(file.id, { active: val })}
                                className="scale-75 data-[state=checked]:bg-indigo-500"
                              />
                            </div>
                          </td>
                          <td className="w-[180px] px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {(file.status === "completed" || file.status === "error" || file.status === "error_triggering") && (
                                <Button
                                  variant="ghost" size="icon"
                                  className={cn(
                                    "size-8 rounded-lg text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10 transition-colors",
                                    retryingFileId === file.id && "animate-spin"
                                  )}
                                  onClick={() => handleRetryRag(file.id)}
                                  disabled={retryingFileId === file.id}
                                  title="Reprocess RAG"
                                >
                                  <RefreshCw className="size-3.5" />
                                </Button>
                              )}

                              <Button
                                variant="ghost" size="icon"
                                className="size-8 rounded-lg text-zinc-400 hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors"
                                onClick={() => {
                                  const parts = file.file_name.split('.');
                                  const ext = parts.pop();
                                  const nameOnly = parts.join('.');
                                  setEditingFile(file);
                                  setRenamingFileTitle(nameOnly);
                                }}
                                title="Rename Document"
                              >
                                <Edit2 className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                                onClick={() => deleteFile(file.id)}
                                title="Delete Document"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Document Viewer Modal */}
      <DocumentViewer
        isOpen={isViewOpen}
        onClose={() => setIsViewOpen(false)}
        file={viewingFile}
      />

      <AdminLogsDrawer
        open={logDrawerOpen}
        onOpenChange={setLogDrawerOpen}
        initialLog={selectedLog}
      />
    </div>
  );
}
