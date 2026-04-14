import logging
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from mem0 import Memory

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

load_dotenv(dotenv_path="../.env")

# OPENAI_BASE_URL dùng cho Next.js (custom base url format)
# Nhưng Groq Python SDK tự xây URL đúng từ API Key nên cần bỏ biến này ra
# để tránh bị double prefix: /openai/v1/openai/v1/...
os.environ.pop("OPENAI_BASE_URL", None)

# ── Mem0 config dùng Groq API (qua openai provider) + Ollama Embedder ──────────
CONFIG = {
    "llm": {
        "provider": "openai",
        "config": {
            "api_key": os.getenv("OPENAI_KEY"),
            "model": "llama-3.1-8b-instant",   # dùng model nhẹ cho memory extraction
            "openai_base_url": "https://api.groq.com/openai/v1",
            "temperature": 0.1,
            "max_tokens": 1000,
        },
    },
    "embedder": {
        "provider": "ollama",
        "config": {
            "model": "nomic-embed-text",
            "ollama_base_url": "http://localhost:11434",
        },
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "path": "mem0_db",
            "embedding_model_dims": 768,
        },
    },
}

MEMORY_INSTANCE = Memory.from_config(CONFIG)

app = FastAPI(title="Mem0 AI Memory Service", version="1.0.0")


# ── Schemas ────────────────────────────────────────────────────────────────────
class Message(BaseModel):
    role: str
    content: str

class MemoryCreate(BaseModel):
    messages: List[Message]
    user_id: Optional[str] = None

class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    top_k: Optional[int] = 5


# ── Endpoints ──────────────────────────────────────────────────────────────────
@app.post("/memories")
def add_memory(body: MemoryCreate):
    """Lưu memory từ danh sách messages."""
    if not body.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    try:
        result = MEMORY_INSTANCE.add(
            messages=[m.model_dump() for m in body.messages],
            user_id=body.user_id,
        )
        return JSONResponse(content=result)
    except Exception as e:
        logging.exception("Error in add_memory:")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search")
def search_memories(body: SearchRequest):
    """Tìm kiếm memory liên quan đến query."""
    if not body.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    try:
        results = MEMORY_INSTANCE.search(
            query=body.query,
            user_id=body.user_id,
            limit=body.top_k,
        )
        # mem0 v1.1 trả về dict {'results': [...]}
        if isinstance(results, dict):
            results = results.get("results", [])
        return {"results": results}
    except Exception as e:
        logging.exception("Error in search_memories:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories")
def get_all_memories(user_id: str):
    """Lấy tất cả memory của user."""
    try:
        return MEMORY_INSTANCE.get_all(user_id=user_id)
    except Exception as e:
        logging.exception("Error in get_all:")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/memories")
def delete_all_memories(user_id: str):
    """Xóa tất cả memory của user."""
    try:
        MEMORY_INSTANCE.delete_all(user_id=user_id)
        return {"message": "All memories deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)