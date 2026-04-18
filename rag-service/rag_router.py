import os
import time
import uuid
import shutil
import base64
import logging
import requests
import psycopg2
import fitz  # Thư viện PyMuPDF xử lý PDF
import docx  # Thư viện xử lý file Word (.docx)
from typing import Optional, List
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from langchain_text_splitters import RecursiveCharacterTextSplitter
from bs4 import BeautifulSoup

# Thử nạp MatchAnyValue (tùy thuộc phiên bản qdrant-client)
try:
    from qdrant_client.http.models import MatchAnyValue
except ImportError:
    MatchAnyValue = None

# Khởi tạo Router cho FastAPI
rag_router = APIRouter()

# --- CẤU HÌNH BIẾN MÔI TRƯỜNG ---
FILE_SERVER_URL = os.getenv("FILE_SERVER_URL", "http://localhost:8080")
COLLECTION_NAME = "knowledge_base" # Tên bộ sưu tập trong véc-tơ DB
EXTERNAL_STORAGE_ROOT = os.getenv("EXTERNAL_STORAGE_PATH", "P:\\mes-buddy-storage")

# --- QUẢN TRỊ KẾT NỐI (CONNECTION MANAGEMENT) ---

def init_kb_client(app):
    """Khởi tạo kết nối Qdrant với cơ chế thử lại (Retry) mạnh mẽ hơn trên Windows."""
    max_retries = 10 # Tăng lên 10 lần thử
    for i in range(max_retries):
        try:
            # Tham số force_disable_check_same_thread=True giúp tránh một số lỗi luồng trên Windows
            client = QdrantClient(path="kb_db")
            if not client.collection_exists(COLLECTION_NAME):
                client.create_collection(
                    collection_name=COLLECTION_NAME,
                    vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
                )
            app.state.kb_qclient = client
            logging.info(f"Khởi tạo Qdrant KB thành công: {COLLECTION_NAME}")
            return
        except Exception as e:
            if i < max_retries - 1:
                logging.warning(f"Qdrant KB đang bận (lần {i+1}/{max_retries}). Đang đợi Windows giải phóng file lock...")
                time.sleep(1) # Đợi 1 giây giữa mỗi lần thử
            else:
                logging.error(f"Thất bại hoàn toàn sau {max_retries} lần thử khởi tạo Qdrant: {e}")
                raise e

def get_db_connection():
    """Tạo kết nối tới cơ sở dữ liệu PostgreSQL chính."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        database=os.getenv("DB_NAME", "mes_assistant"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "123456"),
        port=os.getenv("DB_PORT", "5432")
    )

def update_file_status(file_id: int, status: str, error_message: str = None):
    """Cập nhật trạng thái xử lý file (completed/error) vào Postgres."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        if error_message:
            cur.execute("UPDATE knowledge_files SET status = %s, error_message = %s WHERE id = %s", 
                       (status, error_message, file_id))
        else:
            cur.execute("UPDATE knowledge_files SET status = %s WHERE id = %s", (status, file_id))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        logging.error(f"Lỗi cập nhật trạng thái DB cho file {file_id}: {e}")

# --- XỬ LÝ NHÔM/NHÚNG (EMBEDDING) ---

def get_embeddings(texts: List[str]):
    """Chuyển đổi danh sách văn bản sang danh sách Vector thông qua API."""
    embeddings_url = os.getenv("EMBEDDINGS_BASE_URL", "https://api.jina.ai/v1")
    if not embeddings_url.endswith("/embeddings"):
        embeddings_url += "/embeddings"
        
    headers = {
        "Authorization": f"Bearer {os.getenv('EMBEDDINGS_KEY')}", 
        "Content-Type": "application/json"
    }
    data = {"model": os.getenv("EMBEDDINGS_MODEL", "jina-embeddings-v5-text-small"), "input": texts}
    
    res = requests.post(embeddings_url, headers=headers, json=data)
    res.raise_for_status()
    res_json = res.json()
    
    if "data" in res_json:
        return [item["embedding"] for item in res_json["data"]]
    raise Exception(f"Lỗi Embedding API: {res_json}")

# --- LOGIC XỬ LÝ TÀI LIỆU CHI TIẾT ---

def process_document(kb_qclient, file_id: int, group_id: int, file_path: str):
    """Luồng xử lý chính: Đọc file -> Cắt nhỏ -> Vector hóa -> Lưu trữ."""
    try:
        ext = file_path.lower().split('.')[-1]
        chunks = [] # Danh sách các mẩu văn bản sau khi cắt
        
        # Cấu hình cắt nhỏ văn bản (mỗi mẩu 1000 ký tự, gối đầu 150 ký tự để giữ ngữ cảnh)
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        
        # Tìm thư mục lưu hình ảnh trích xuất: {root}/group_{G}/file_{F}/images/
        file_folder = os.path.dirname(os.path.dirname(file_path))
        images_dir = os.path.join(file_folder, "images")
        os.makedirs(images_dir, exist_ok=True)
        
        # 1. Xử lý file PDF
        if ext == "pdf":
            doc = fitz.open(file_path)
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text()
                
                # Trích xuất ảnh từ trang PDF
                images_on_page = []
                for img_idx, img in enumerate(page.get_images(full=True)):
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    img_name = f"{page_num}_{img_idx}.{base_image['ext']}"
                    img_full_path = os.path.join(images_dir, img_name)
                    with open(img_full_path, "wb") as f:
                        f.write(base_image["image"])
                    
                    images_on_page.append(f"/group_{group_id}/file_{file_id}/images/{img_name}")
                
                # Cắt văn bản trang này
                page_chunks = splitter.split_text(text)
                for chunk in page_chunks:
                    # Gán ảnh đầu tiên tìm thấy trên trang cho mẩu văn bản này (nếu có)
                    img_url = images_on_page[0] if images_on_page else None
                    chunks.append({"text": chunk, "image_url": img_url, "page": page_num})
                    
        # 2. Xử lý file Word (.docx)
        elif ext in ["doc", "docx"]:
            doc = docx.Document(file_path)
            full_text = "\n".join([para.text for para in doc.paragraphs])
            for chunk in splitter.split_text(full_text):
                chunks.append({"text": chunk, "image_url": None, "page": 0})
                
        # 3. Xử lý file văn bản thuần (.txt)
        elif ext == "txt":
            with open(file_path, 'r', encoding='utf-8') as f:
                full_text = f.read()
            for chunk in splitter.split_text(full_text):
                chunks.append({"text": chunk, "image_url": None, "page": 0})

        # 4. Xử lý file HTML (Hướng dẫn vận hành SDV)
        elif ext == "html":
            with open(file_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Trình trích xuất ảnh thông minh từ HTML (Base64 hoặc URL)
            img_tags = soup.find_all('img')
            images_list = []
            for idx, img in enumerate(img_tags):
                src = img.get('src', '')
                if not src: continue
                img_name, img_data = None, None
                
                try:
                    if src.startswith('data:image'): # Dạng chuỗi Base64
                        header, data = src.split(',', 1)
                        img_ext = header.split('image/')[1].split(';')[0] if 'image/' in header else "png"
                        img_data = base64.b64decode(data)
                        img_name = f"img_{idx}.{img_ext}"
                    elif src.startswith('http'): # Dạng đường dẫn mạng
                        img_res = requests.get(src, timeout=10)
                        if img_res.status_code == 200:
                            img_ext = src.split('.')[-1].split('?')[0][:4] or "png"
                            img_name = f"img_{idx}.{img_ext}"
                            img_data = img_res.content
                    
                    if img_name and img_data:
                        with open(os.path.join(images_dir, img_name), "wb") as f:
                            f.write(img_data)
                        rel_url = f"/group_{group_id}/file_{file_id}/images/{img_name}"
                        images_list.append({"index": idx, "url": rel_url, "tag": img})
                        # Đánh dấu vị trí ảnh trong văn bản
                        img.replace_with(f" [IMG_REF_{idx}] ")
                except Exception as ex:
                    logging.warning(f"Bỏ qua ảnh {idx} do lỗi: {ex}")

            # Trích xuất văn bản thuần và cắt nhỏ
            full_text = soup.get_text(separator='\n')
            for chunk in splitter.split_text(full_text):
                found_url = next((info["url"] for info in images_list if f"[IMG_REF_{info['index']}]" in chunk), None)
                # Làm sạch nhãn đánh dấu trước khi lưu
                clean_chunk = chunk
                for info in images_list: clean_chunk = clean_chunk.replace(f"[IMG_REF_{info['index']}]", "")
                if clean_chunk.strip():
                    chunks.append({"text": clean_chunk.strip(), "image_url": found_url, "page": 0})

        # --- GIAI ĐOẠN LƯU TRỮ VECTOR ---
        if not chunks:
            update_file_status(file_id, "error", "Không thể trích xuất nội dung từ tài liệu này.")
            return
            
        # Xử lý theo từng lô (Batch) 50 mẩu để tối ưu hiệu năng API
        for i in range(0, len(chunks), 50):
            batch = chunks[i:i+50]
            texts = [c["text"] for c in batch]
            embs = get_embeddings(texts) # Chuyển văn bản sang Vector
            
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
            # Đẩy dữ liệu vào Qdrant
            kb_qclient.upsert(collection_name=COLLECTION_NAME, points=points)
            
        update_file_status(file_id, "completed")
        logging.info(f"Hoàn tất xử lý Knowledge Base cho file {file_id}")

    except Exception as e:
        import traceback
        logging.error(f"Thất bại khi xử lý file {file_id}:\n{traceback.format_exc()}")
        update_file_status(file_id, "error", str(e))

# --- CÁC ĐỊNH NGHĨA REQUEST (SCHEMAS) ---

class ProcessRequest(BaseModel):
    file_id: int
    group_id: int
    file_path: str

class DeleteRequest(BaseModel): file_id: int
class DeleteGroupRequest(BaseModel): group_id: int
class SearchRequest(BaseModel): 
    query: str
    top_k: int = 5

# --- CÁC ROUTE API (ENDPOINTS) ---

@rag_router.post("/process", summary="Bắt đầu xử lý file")
def process_rag(req: ProcessRequest, background_tasks: BackgroundTasks, request: Request):
    """Tiếp nhận file kiến thức và bắt đầu quy trình trích xuất ngầm (Background Task)."""
    kb_qclient = request.app.state.kb_qclient
    background_tasks.add_task(process_document, kb_qclient, req.file_id, req.group_id, req.file_path)
    return {"status": "started"}

@rag_router.post("/delete", summary="Xóa kiến thức của 1 file")
def delete_rag(req: DeleteRequest, request: Request):
    """Xóa các vector liên quan đến file trong Qdrant và xóa file vật lý trên disk."""
    kb_qclient = request.app.state.kb_qclient
    try:
        # 1. Xóa dữ liệu vector
        kb_qclient.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(must=[FieldCondition(key="file_id", match=MatchValue(value=req.file_id))])
        )
        # 2. Xóa thư mục lưu trữ vật lý
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT group_id FROM knowledge_files WHERE id = %s", (req.file_id,))
            row = cur.fetchone()
            if row:
                file_folder = os.path.join(EXTERNAL_STORAGE_ROOT, f"group_{row[0]}", f"file_{req.file_id}")
                if os.path.exists(file_folder): shutil.rmtree(file_folder)
            cur.close() ; conn.close()
        except Exception as ex: logging.warning(f"Không thể xóa thư mục vật lý file_{req.file_id}: {ex}")
        return {"status": "deleted"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@rag_router.post("/sync", summary="Dọn rác database vector")
def sync_rag(request: Request):
    """Đồng bộ hóa: Xóa các vector trong Qdrant nếu file tương ứng không còn trong Postgres."""
    kb_qclient = request.app.state.kb_qclient
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM knowledge_files")
        valid_ids = [row[0] for row in cur.fetchall()]
        cur.close() ; conn.close()
        
        if not valid_ids:
            kb_qclient.delete(collection_name=COLLECTION_NAME, points_selector=Filter())
        else:
            # Xóa các vector có file_id KHÔNG nằm trong danh sách valid_ids
            if MatchAnyValue:
                kb_qclient.delete(collection_name=COLLECTION_NAME, 
                    points_selector=Filter(must_not=[FieldCondition(key="file_id", match=MatchAnyValue(any=valid_ids))]))
            else:
                for fid in valid_ids: # Fallback cho phiên bản cũ
                    kb_qclient.delete(collection_name=COLLECTION_NAME, 
                        points_selector=Filter(must_not=[FieldCondition(key="file_id", match=MatchValue(value=fid))]))
        return {"status": "synced", "count": len(valid_ids)}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@rag_router.post("/search", summary="Truy vấn kiến thức thông minh")
def search_rag(req: SearchRequest, request: Request):
    """Tìm kiếm kến thức dùng kết hợp Vector Search và Reranking (Jina AI)."""
    kb_qclient = request.app.state.kb_qclient
    try:
        # Bước 1: Chuyển câu hỏi sang vector
        query_emb = get_embeddings([req.query])[0]
        
        # Bước 2: Tìm kiếm sơ bộ trong Qdrant (lấy 15 kết quả tiềm năng nhất)
        search_result = kb_qclient.query_points(
            collection_name=COLLECTION_NAME, query=query_emb, limit=15, with_payload=True,
        ).points
        
        if not search_result: return {"results": []}
            
        # Bước 3: Sắp xếp lại (Reranking) bằng Jina Reranker để lấy kết quả chính xác nhất
        rerank_url = os.getenv("RERANK_BASE_URL", "https://api.jina.ai/v1/rerank")
        docs = [hit.payload.get("text", "") for hit in search_result]
        headers = {"Authorization": f"Bearer {os.getenv('RERANK_KEY')}", "Content-Type": "application/json"}
        req_data = {
            "model": os.getenv("RERANK_MODEL", "jina-reranker-v3"),
            "query": req.query, "documents": docs, "top_n": req.top_k
        }
        res = requests.post(rerank_url, headers=headers, json=req_data)
        
        if res.status_code == 200:
            rerank_json = res.json()
            results = []
            for item in rerank_json.get("results", []):
                hit = search_result[item["index"]]
                results.append({
                    "text": hit.payload.get("text"),
                    "image_url": hit.payload.get("image_url"),
                    "score": item["relevance_score"]
                })
            return {"results": results}
        
        # Bước 4: Trả về kết quả fallback nếu Reranker lỗi
        return {"results": [{"text": h.payload.get("text"), "image_url": h.payload.get("image_url")} for h in search_result[:req.top_k]]}
    except Exception as e:
        logging.error(f"Lỗi tìm kiếm RAG: {e}")
        raise HTTPException(status_code=500, detail=str(e))
