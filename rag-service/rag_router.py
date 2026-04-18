import os
import fitz  # PyMuPDF
import docx
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from typing import Optional, List
import requests
import psycopg2
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
try:
    from qdrant_client.http.models import MatchAnyValue
except ImportError:
    MatchAnyValue = None
import uuid
import shutil
from langchain_text_splitters import RecursiveCharacterTextSplitter
import base64
from bs4 import BeautifulSoup

rag_router = APIRouter()

# Get config from env
FILE_SERVER_URL = os.getenv("FILE_SERVER_URL", "http://localhost:8080")

# Global collection name
COLLECTION_NAME = "knowledge_base"

def init_kb_client(app):
    """Initialize Qdrant client and store in app state to avoid double-locking on Windows reload."""
    try:
        client = QdrantClient(path="kb_db")
        if not client.collection_exists(COLLECTION_NAME):
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
            )
        app.state.kb_qclient = client
        print(f">>> Qdrant KB initialized in collection: {COLLECTION_NAME}")
    except Exception as e:
        print("Qdrant KB init err:", e)
        raise e


class ProcessRequest(BaseModel):
    file_id: int
    group_id: int
    file_path: str

class DeleteRequest(BaseModel):
    file_id: int

class DeleteGroupRequest(BaseModel):
    group_id: int

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        database=os.getenv("DB_NAME", "mes_assistant"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "123456"),
        port=os.getenv("DB_PORT", "5432")
    )


def update_file_status(file_id: int, status: str, error_message: str = None):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        if error_message:
            cur.execute("UPDATE knowledge_files SET status = %s, error_message = %s WHERE id = %s", (status, error_message, file_id))
        else:
            cur.execute("UPDATE knowledge_files SET status = %s WHERE id = %s", (status, file_id))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print("DB update err:", e)


def get_embeddings(texts: List[str]):
    embeddings_url = os.getenv("EMBEDDINGS_BASE_URL", "https://api.jina.ai/v1")
    if not embeddings_url.endswith("/embeddings"):
        embeddings_url += "/embeddings"
        
    embeddings_key = os.getenv("EMBEDDINGS_KEY")
    embeddings_model = os.getenv("EMBEDDINGS_MODEL", "jina-embeddings-v5-text-small")
    
    headers = {"Authorization": f"Bearer {embeddings_key}", "Content-Type": "application/json"}
    data = {"model": embeddings_model, "input": texts}
    res = requests.post(embeddings_url, headers=headers, json=data)
    res.raise_for_status()
    res_json = res.json()
    if "data" in res_json:
        return [item["embedding"] for item in res_json["data"]]
    else:
        raise Exception(f"Embedding failed: {res_json}")


def process_document(kb_qclient, file_id: int, group_id: int, file_path: str):
    try:
        ext = file_path.lower().split('.')[-1]
        chunks = []
        
        # Prepare text splitter
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        
        # Target images dir: {root}/group_{G}/file_{F}/images/
        # file_path is {root}/group_{G}/file_{F}/origin/hash.pdf
        file_folder = os.path.dirname(os.path.dirname(file_path))
        images_dir = os.path.join(file_folder, "images")
        os.makedirs(images_dir, exist_ok=True)
        
        if ext == "pdf":
            doc = fitz.open(file_path)
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text()
                
                # Check for images on page
                images_on_page = []
                for img_idx, img in enumerate(page.get_images(full=True)):
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    img_ext = base_image["ext"]
                    # Save image and store reference
                    # Use index for simple naming
                    img_name = f"{page_num}_{img_idx}.{img_ext}"
                    img_full_path = os.path.join(images_dir, img_name)
                    with open(img_full_path, "wb") as f:
                        f.write(image_bytes)
                    
                    # URL: {server}/group_{G}/file_{F}/images/{img_name}
                    relative_url = f"/group_{group_id}/file_{file_id}/images/{img_name}"
                    images_on_page.append(relative_url)
                
                # Split text
                page_chunks = splitter.split_text(text)
                for chunk in page_chunks:
                    img_url = images_on_page[0] if images_on_page else None
                    chunks.append({"text": chunk, "image_url": img_url, "page": page_num})
                    
        elif ext in ["doc", "docx"]:
            # Simple text extraction for docx
            # python-docx doesn't easily extract exact location of images, 
            # so we just extract text for now as a fallback
            doc = docx.Document(file_path)
            full_text = "\n".join([para.text for para in doc.paragraphs])
            text_chunks = splitter.split_text(full_text)
            for chunk in text_chunks:
                chunks.append({"text": chunk, "image_url": None, "page": 0})
                
        elif ext == "txt":
            with open(file_path, 'r', encoding='utf-8') as f:
                full_text = f.read()
            text_chunks = splitter.split_text(full_text)
            for chunk in text_chunks:
                chunks.append({"text": chunk, "image_url": None, "page": 0})
        elif ext == "html":
            with open(file_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Xử lý hình ảnh trong HTML
            img_tags = soup.find_all('img')
            images_list = []
            
            for idx, img in enumerate(img_tags):
                src = img.get('src', '')
                if not src: continue
                
                img_name = f"manual_{idx}"
                img_ext = "png"
                img_save_path = None
                
                try:
                    if src.startswith('data:image'):
                        # Xử lý ảnh base64
                        header, data = src.split(',', 1)
                        if 'image/' in header:
                            img_ext = header.split('image/')[1].split(';')[0]
                        img_data = base64.b64decode(data)
                        img_name = f"img_{idx}.{img_ext}"
                        img_save_path = os.path.join(images_dir, img_name)
                        with open(img_save_path, "wb") as f:
                            f.write(img_data)
                    elif src.startswith('http'):
                        # Tải ảnh từ URL
                        img_res = requests.get(src, timeout=10)
                        if img_res.status_code == 200:
                            img_ext = src.split('.')[-1].split('?')[0].split('#')[0]
                            if len(img_ext) > 4 or not img_ext: img_ext = "png"
                            img_name = f"img_{idx}.{img_ext}"
                            img_save_path = os.path.join(images_dir, img_name)
                            with open(img_save_path, "wb") as f:
                                f.write(img_res.content)
                    
                    if img_save_path:
                        relative_url = f"/group_{group_id}/file_{file_id}/images/{img_name}"
                        images_list.append({"index": idx, "url": relative_url, "tag": img})
                except Exception as e:
                    print(f"Lỗi xử lý ảnh {idx}: {e}")

            # Gắn marker để ánh xạ ảnh vào chunk văn bản
            for img_info in images_list:
                img_info["tag"].replace_with(f" [IMG_REF_{img_info['index']}] ")
            
            full_text = soup.get_text(separator='\n')
            text_chunks = splitter.split_text(full_text)
            
            for chunk in text_chunks:
                found_img_url = None
                for img_info in images_list:
                    if f"[IMG_REF_{img_info['index']}]" in chunk:
                        found_img_url = img_info["url"]
                        break
                
                # Làm sạch marker trước khi lưu
                cleaned_chunk = chunk
                for img_info in images_list:
                    cleaned_chunk = cleaned_chunk.replace(f"[IMG_REF_{img_info['index']}]", "")
                
                if cleaned_chunk.strip():
                    chunks.append({"text": cleaned_chunk.strip(), "image_url": found_img_url, "page": 0})
        else:
            raise Exception(f"Unsupported file extension: {ext}")

        if not chunks:
            update_file_status(file_id, "error", "No text or images could be extracted from this document.")
            return
            
        # Batch insert to Qdrant length 100 max
        batch_size = 50
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i+batch_size]
            texts = [c["text"] for c in batch]
            embs = get_embeddings(texts)
            
            points = []
            for j, emb in enumerate(embs):
                points.append(PointStruct(
                    id=str(uuid.uuid4()),
                    vector=emb,
                    payload={
                        "file_id": file_id,
                        "group_id": group_id,
                        "text": batch[j]["text"],
                        "image_url": batch[j]["image_url"],
                        "page": batch[j]["page"]
                    }
                ))
            kb_qclient.upsert(collection_name=COLLECTION_NAME, points=points)
            
        update_file_status(file_id, "completed")
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"Failed processing file {file_id}:\n{error_detail}")
        # Save a clean version of the error message to DB
        clean_error = str(e)
        update_file_status(file_id, "error", clean_error)


@rag_router.post("/process")
def process_rag(req: ProcessRequest, background_tasks: BackgroundTasks, request: Request):
    kb_qclient = request.app.state.kb_qclient
    # Process asynchronously to not block the response
    background_tasks.add_task(process_document, kb_qclient, req.file_id, req.group_id, req.file_path)
    return {"status": "started"}


@rag_router.post("/delete")
def delete_rag(req: DeleteRequest, request: Request):
    kb_qclient = request.app.state.kb_qclient
    try:
        # 1. Delete vectors from Qdrant
        kb_qclient.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(
                must=[FieldCondition(key="file_id", match=MatchValue(value=req.file_id))]
            )
        )
        
        # 2. Delete physical folder
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT group_id FROM knowledge_files WHERE id = %s", (req.file_id,))
            row = cur.fetchone()
            if row:
                group_id = row[0]
                storage_root = os.getenv("EXTERNAL_STORAGE_PATH", "P:\\mes-buddy-storage")
                file_folder = os.path.join(storage_root, f"group_{group_id}", f"file_{req.file_id}")
                if os.path.exists(file_folder):
                    shutil.rmtree(file_folder)
            cur.close()
            conn.close()
        except Exception as e:
            print("Physical delete err:", e)

        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@rag_router.post("/delete_group")
def delete_group_rag(req: DeleteGroupRequest, request: Request):
    kb_qclient = request.app.state.kb_qclient
    try:
        # 1. Delete all vectors for this group
        kb_qclient.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(
                must=[FieldCondition(key="group_id", match=MatchValue(value=req.group_id))]
            )
        )
        
        # 2. Delete entire group folder
        try:
            storage_root = os.getenv("EXTERNAL_STORAGE_PATH", "P:\\mes-buddy-storage")
            group_folder = os.path.join(storage_root, f"group_{req.group_id}")
            if os.path.exists(group_folder):
                shutil.rmtree(group_folder)
        except Exception as e:
            print(f"Group folder delete err (group_{req.group_id}):", e)

        return {"status": "group_deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@rag_router.post("/sync")
def sync_rag(request: Request):
    kb_qclient = request.app.state.kb_qclient
    print(">>> INVOKING RAG SYNC ENDPOINT")
    try:
        # 1. Get all valid file IDs from Postgres
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM knowledge_files")
        valid_ids = [row[0] for row in cur.fetchall()]
        cur.close()
        conn.close()
        
        print(f">>> Valid IDs in Postgres: {valid_ids}")
        
        # 2. Delete vectors NOT in valid_ids
        if not valid_ids:
            print(">>> Database empty, clearing all vectors from Qdrant.")
            kb_qclient.delete(
                collection_name=COLLECTION_NAME,
                points_selector=Filter()
            )
        else:
            print(f">>> Removing orphaned vectors (keeping only: {valid_ids})")
            if MatchAnyValue:
                kb_qclient.delete(
                    collection_name=COLLECTION_NAME,
                    points_selector=Filter(
                        must_not=[
                            FieldCondition(key="file_id", match=MatchAnyValue(any=valid_ids))
                        ]
                    )
                )
            else:
                # Fallback for older qdrant-client versions
                kb_qclient.delete(
                    collection_name=COLLECTION_NAME,
                    points_selector=Filter(
                        must_not=[
                            FieldCondition(key="file_id", match=MatchValue(value=fid))
                            for fid in valid_ids
                        ]
                    )
                )
            
        return {"status": "synced", "valid_count": len(valid_ids)}
    except Exception as e:
        import traceback
        print(f"Sync error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@rag_router.post("/search")
def search_rag(req: SearchRequest, request: Request):
    kb_qclient = request.app.state.kb_qclient
    try:
        query_emb = get_embeddings([req.query])[0]
        
        # 1. Search in Vector DB using query_points (qdrant-client >= 1.7)
        search_result = kb_qclient.query_points(
            collection_name=COLLECTION_NAME,
            query=query_emb,
            limit=15,
            with_payload=True,
        ).points
        
        if not search_result:
            return {"results": []}
            
        # 2. Rerank using Jina Reranker
        rerank_url = os.getenv("RERANK_BASE_URL", "https://api.jina.ai/v1/rerank")
        rerank_key = os.getenv("RERANK_KEY")
        rerank_model = os.getenv("RERANK_MODEL", "jina-reranker-v3")
        
        docs = [hit.payload.get("text", "") for hit in search_result]
        
        headers = {"Authorization": f"Bearer {rerank_key}", "Content-Type": "application/json"}
        req_data = {
            "model": rerank_model,
            "query": req.query,
            "documents": docs,
            "top_n": req.top_k
        }
        res = requests.post(rerank_url, headers=headers, json=req_data)
        
        if res.status_code == 200:
            rerank_json = res.json()
            results = []
            for item in rerank_json.get("results", []):
                idx = item["index"]
                original_hit = search_result[idx]
                results.append({
                    "text": original_hit.payload.get("text"),
                    "image_url": original_hit.payload.get("image_url"),
                    "score": item["relevance_score"]
                })
            return {"results": results}
        else:
            # Fallback if reranker fails
            return {"results": [{"text": hit.payload.get("text"), "image_url": hit.payload.get("image_url")} for hit in search_result[:req.top_k]]}
            
    except Exception as e:
        print("RAG search error:", e)
        raise HTTPException(status_code=500, detail=str(e))
