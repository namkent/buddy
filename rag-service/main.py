import logging
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from contextlib import asynccontextmanager
from mem0 import Memory
from rag_router import rag_router, init_kb_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

load_dotenv(dotenv_path="../.env")

# Note: mem0 uses openai provider, so we need OPENAI_BASE_URL intact.
# ── Mem0 config dùng Groq API (qua openai provider) + Jina Embedder API ──────────
CONFIG = {
    "llm": {
        "provider": "openai",
        "config": {
            "api_key": os.getenv("OPENAI_KEY"),
            "model": os.getenv("OPENAI_MODEL"),
            "openai_base_url": os.getenv("OPENAI_BASE_URL"),
            "temperature": 0.1,
            "max_tokens": 1000,
        },
    },
    "embedder": {
        "provider": "openai",
        "config": {
            "model": os.getenv("EMBEDDINGS_MODEL"),
            "openai_base_url": os.getenv("EMBEDDINGS_BASE_URL"),
            "api_key": os.getenv("EMBEDDINGS_KEY"),
        },
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "path": "mem0_db",
            "embedding_model_dims": 1024,
        },
    },
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize RAG KB
    init_kb_client(app)
    
    # Startup: Initialize Mem0
    app.state.memory = Memory.from_config(CONFIG)
    yield
    # Shutdown: Clean up if needed
    pass

app = FastAPI(title="Mem0 AI Memory Service", version="1.0.0", lifespan=lifespan)
app.include_router(rag_router, prefix="/rag")

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
def add_memory(body: MemoryCreate, request: Request):
    """Lưu memory từ danh sách messages."""
    memory_instance = request.app.state.memory
    if not body.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    try:
        result = memory_instance.add(
            messages=[m.model_dump() for m in body.messages],
            user_id=body.user_id,
        )
        return JSONResponse(content=result)
    except Exception as e:
        logging.exception("Error in add_memory:")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search")
def search_memories(body: SearchRequest, request: Request):
    """Tìm kiếm memory liên quan đến query."""
    memory_instance = request.app.state.memory
    if not body.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    try:
        results = memory_instance.search(
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
def get_all_memories(user_id: str, request: Request):
    """Lấy tất cả memory của user."""
    memory_instance = request.app.state.memory
    try:
        return memory_instance.get_all(user_id=user_id)
    except Exception as e:
        logging.exception("Error in get_all:")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/memories")
def delete_all_memories(user_id: str, request: Request):
    """Xóa tất cả memory của user."""
    memory_instance = request.app.state.memory
    try:
        memory_instance.delete_all(user_id=user_id)
        return {"message": "All memories deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("RAG_SERVICE_PORT", 8000))
    # Enable reload for easier development
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)