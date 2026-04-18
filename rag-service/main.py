import logging # Reload triggered by Antigravity
import os
import sys
import io
import time
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from mem0 import Memory

# Tải router xử lý RAG từ file rag_router.py
from rag_router import rag_router, init_kb_client

# --- CẤU HÌNH HỆ THỐNG & LOGGING ---

# Đảm bảo Terminal hiển thị đúng tiếng Việt (UTF-8) trên Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Cấu hình log để theo dõi hoạt động của hệ thống
logging.basicConfig(
    level=logging.INFO, 
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

# Nạp các biến môi trường từ file .env (ở thư mục gốc của dự án)
load_dotenv(dotenv_path="../.env")

# --- CẤU HÌNH MEM0 (AI MEMORY LAYER) ---
# Mem0 giúp AI ghi nhớ các thông tin quan trọng từ người dùng qua các phiên chat
CONFIG = {
    "llm": {
        "provider": "openai", # Sử dụng giao thức OpenAI (tương thích với Groq)
        "config": {
            "api_key": os.getenv("OPENAI_KEY"),
            "model": os.getenv("OPENAI_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct"),
            "openai_base_url": os.getenv("OPENAI_BASE_URL"),
            "temperature": 0.1,
            "max_tokens": 1000,
        },
    },
    "embedder": {
        "provider": "openai", # Sử dụng API Embedding (như Jina hoặc OpenAI)
        "config": {
            "model": os.getenv("EMBEDDINGS_MODEL", "jina-embeddings-v5-text-small"),
            "openai_base_url": os.getenv("EMBEDDINGS_BASE_URL"),
            "api_key": os.getenv("EMBEDDINGS_KEY"),
        },
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "path": "mem0_db", # Cơ sở dữ liệu vector lưu trữ ký ức ngắn hạn
            "embedding_model_dims": 1024, # Số chiều của vector (Jina v5 thường là 1024)
        },
    },
}

# --- QUẢN LÝ VÒNG ĐỜI ỨNG DỤNG (LIFESPAN) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Xử lý các tác vụ khi khởi động và tắt ứng dụng."""
    # Tạo khoảng nghỉ ngắn để Windows kịp giải phóng file lock từ tiến trình cũ (nếu có)
    time.sleep(1)
    
    # Khởi tạo client kết nối với Knowledge Base (RAG)
    init_kb_client(app)
    
    # Khởi tạo bộ nhớ Mem0 từ cấu hình trên
    try:
        app.state.memory = Memory.from_config(CONFIG)
    except Exception as e:
        logging.warning(f"Qdrant Mem0 đang bận, thử lại sau 1s... ({e})")
        time.sleep(1)
        app.state.memory = Memory.from_config(CONFIG)
    
    yield # Ứng dụng đang chạy...
    
    # Dọn dẹp tài nguyên khi ứng dụng tắt (tránh lỗi khóa file trên Windows)
    if hasattr(app.state, "kb_qclient"):
        print(">>> Đang đóng kết nối Qdrant Knowledge Base...")
        app.state.kb_qclient.close()

# Khởi tạo ứng dụng FastAPI
app = FastAPI(
    title="MES Buddy - AI Memory & RAG Service", 
    description="Dịch vụ xử lý bộ nhớ dài hạn và truy vấn kiến thức nội bộ",
    version="1.1.0", 
    lifespan=lifespan
)

# Nhúng các route xử lý RAG (từ file rag_router.py) vào ứng dụng chính
app.include_router(rag_router, prefix="/rag")

# --- ĐỊNH NGHĨA DỮ LIỆU (SCHEMAS) ---

class Message(BaseModel):
    role: str # 'user' hoặc 'assistant'
    content: str # Nội dung tin nhắn

class MemoryCreate(BaseModel):
    messages: List[Message]
    user_id: Optional[str] = None

class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    top_k: Optional[int] = 5


# --- CÁC ĐIỂM TIẾP NHẬN DỮ LIỆU (ENDPOINTS) ---

@app.post("/memories", summary="Lưu ký ức mới")
def add_memory(body: MemoryCreate, request: Request):
    """Phân tích tin nhắn và trích xuất các thông tin cần ghi nhớ vào database."""
    memory_instance = request.app.state.memory
    if not body.user_id:
        raise HTTPException(status_code=400, detail="Thiếu user_id")
    try:
        # Chuyển đổi và lưu trữ ký ức thông qua Mem0
        result = memory_instance.add(
            messages=[m.model_dump() for m in body.messages],
            user_id=body.user_id,
        )
        return JSONResponse(content=result)
    except Exception as e:
        logging.exception("Lỗi khi lưu ký ức:")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search", summary="Tìm kiếm ký ức cũ")
def search_memories(body: SearchRequest, request: Request):
    """Tìm lại các thông tin liên quan mà người dùng đã từng nói trước đây."""
    memory_instance = request.app.state.memory
    if not body.user_id:
        raise HTTPException(status_code=400, detail="Thiếu user_id")
    try:
        results = memory_instance.search(
            query=body.query,
            user_id=body.user_id,
            limit=body.top_k,
        )
        # Hỗ trợ định dạng trả về của Mem0 phiên bản mới
        if isinstance(results, dict):
            results = results.get("results", [])
        return {"results": results}
    except Exception as e:
        logging.exception("Lỗi khi tìm kiếm ký ức:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories", summary="Lấy danh sách ký ức")
def get_all_memories(user_id: str, request: Request):
    """Liệt kê toàn bộ các mẩu thông tin đang ghi nhớ của một người dùng cụ thể."""
    memory_instance = request.app.state.memory
    try:
        return memory_instance.get_all(user_id=user_id)
    except Exception as e:
        logging.exception("Lỗi khi lấy danh sách ký ức:")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/memories", summary="Xóa sạch ký ức")
def delete_all_memories(user_id: str, request: Request):
    """Xóa bỏ toàn bộ dữ liệu ghi nhớ của người dùng (Reset trí nhớ)."""
    memory_instance = request.app.state.memory
    try:
        memory_instance.delete_all(user_id=user_id)
        return {"message": "Đã xóa toàn bộ ký ức thành công"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- KHỞI CHẠY SERVER ---
if __name__ == "__main__":
    import uvicorn
    # Lấy cổng Port từ cấu hình .env (mặc định là 8000)
    port = int(os.getenv("RAG_SERVICE_PORT", 8000))
    # Chế độ reload=True giúp tự động cập nhật khi bạn sửa code
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)