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
import re
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

def get_image_description(image_path: str):
    """Sử dụng Vision API để lấy mô tả nội dung hình ảnh."""
    # 1. Kiểm tra tính năng có được bật hay không
    if os.getenv("ENABLE_RAG_VISION", "false").lower() != "true":
        return ""
        
    api_key = os.getenv("OPENAI_KEY")
    base_url = os.getenv("OPENAI_BASE_URL")
    model = os.getenv("VISION_MODEL")
    
    if not api_key:
        logging.warning("Missing OPENAI_KEY for RAG Vision.")
        return ""
        
    if not base_url:
        logging.warning("Missing OPENAI_BASE_URL for RAG Vision. Image description skipped.")
        return ""

    if not model:
        logging.warning("Missing VISION_MODEL for RAG Vision. Image description skipped.")
        return ""
        
    try:
        with open(image_path, "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Mô tả ngắn gọn nội dung ảnh này bằng tiếng Việt (1-2 câu)."},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}
                        }
                    ]
                }
            ],
            "max_tokens": 300
        }
        
        # Chỉ sử dụng base_url từ .env, không fix cứng fallback OpenAI
        url = f"{base_url.rstrip('/')}/chat/completions"
        response = requests.post(url, headers=headers, json=payload, timeout=45)
        
        if response.status_code != 200:
            logging.error(f"Vision API Error ({response.status_code}): {response.text}")
            return ""
            
        result = response.json()
        return result['choices'][0]['message']['content'].strip()
    except Exception as e:
        logging.error(f"Exception in get_image_description for {image_path}: {e}")
        return ""

# --- LOGIC XỬ LÝ TÀI LIỆU CHI TIẾT ---

def process_document(kb_qclient, file_id: int, group_id: int, file_path: str, file_name: str = None):
    """Luồng xử lý chính: Đọc file -> Cắt nhỏ -> Vector hóa -> Lưu trữ."""
    if not file_name:
        file_name = os.path.basename(file_path)
    try:
        # Tập trung log vào một file dễ tìm
        global_log = r"P:\mes-buddy-storage\rag_global_debug.txt"
        with open(global_log, "a", encoding="utf-8") as f:
            f.write(f"\n--- {time.ctime()} --- Processing file_id={file_id}, group_id={group_id}\n")
            f.write(f"Path: {file_path}\n")
            
        ext = file_path.lower().split('.')[-1]
        with open(global_log, "a", encoding="utf-8") as f:
            f.write(f"Extension: {ext}\n")
            
        chunks = [] # Danh sách các mẩu văn bản sau khi cắt
        
        # Tìm thư mục lưu hình ảnh trích xuất: {root}/group_{G}/file_{F}/images/
        file_folder = os.path.dirname(os.path.dirname(file_path))
        images_dir = os.path.join(file_folder, "images")
        os.makedirs(images_dir, exist_ok=True)
        with open(global_log, "a", encoding="utf-8") as f:
            f.write(f"Images Dir: {images_dir}\n")

        # Cấu hình cắt nhỏ văn bản tối ưu cho văn bản dài và pháp lý
        # Ưu tiên ngắt đoạn tại các mục Điều, Chương, Mục để giữ ngữ cảnh
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1500, 
            chunk_overlap=200,
            separators=["\nĐiều ", "\nChương ", "\nMục ", "\nPhần ", "\n\n", "\n", " "]
        )

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
                    img_name = f"pdf_{page_num}_{img_idx}.{base_image['ext']}"
                    img_full_path = os.path.join(images_dir, img_name)
                    with open(img_full_path, "wb") as f:
                        f.write(base_image["image"])
                    
                    # Lấy mô tả ảnh bằng AI
                    description = get_image_description(img_full_path)
                    
                    rel_url = f"/group_{group_id}/file_{file_id}/images/{img_name}"
                    images_on_page.append({"url": rel_url, "desc": description})
                    # Chèn marker kèm mô tả để AI biết nội dung ảnh
                    text += f"\n\n[Mô tả ảnh: {description}] ![image]({rel_url})\n"
                
                # Cắt văn bản trang này
                page_chunks = splitter.split_text(text)
                for chunk in page_chunks:
                    # Gắn ảnh chỉ khi chunk thực sự chứa markdown tag ảnh
                    import re
                    found_imgs = re.findall(r'!\[.*?\]\((.*?)\)', chunk)
                    # Không mặc định lấy ảnh đầu trang nếu chunk không chứa ảnh
                    img_urls = found_imgs if found_imgs else []
                    chunks.append({"text": chunk, "images": img_urls, "page": page_num + 1})
                    
        # 2. Xử lý file Word (.docx)
        elif ext in ["doc", "docx"]:
            doc = docx.Document(file_path)
            
            # Trích xuất ảnh từ docx
            docx_images = []
            img_counter = 0
            for rel in doc.part.rels.values():
                if "image" in rel.target_ref:
                    img_counter += 1
                    img_data = rel.target_part.blob
                    img_ext = rel.target_ref.split('.')[-1]
                    img_name = f"docx_{img_counter}.{img_ext}"
                    img_full_path = os.path.join(images_dir, img_name)
                    with open(img_full_path, "wb") as f:
                        f.write(img_data)
                    
                    # Lấy mô tả ảnh bằng AI
                    description = get_image_description(img_full_path)
                    
                    rel_url = f"/group_{group_id}/file_{file_id}/images/{img_name}"
                    docx_images.append({"url": rel_url, "desc": description})

            # Lấy text và chèn ảnh kèm mô tả vào cuối
            full_text = "\n".join([para.text for para in doc.paragraphs])
            if docx_images:
                full_text += "\n\n### HÌNH ẢNH TRONG TÀI LIỆU:\n"
                for iinfo in docx_images:
                    full_text += f"[Mô tả: {iinfo['desc']}] ![image]({iinfo['url']})\n"

            for chunk in splitter.split_text(full_text):
                import re
                found_imgs = re.findall(r'!\[.*?\]\((.*?)\)', chunk)
                img_urls = found_imgs if found_imgs else []
                chunks.append({"text": chunk, "images": img_urls, "page": 1})
                
        # 3. Xử lý file văn bản thuần (.txt)
        elif ext == "txt":
            with open(file_path, 'r', encoding='utf-8') as f:
                full_text = f.read()
            for chunk in splitter.split_text(full_text):
                chunks.append({"text": chunk, "image_url": None, "page": 0})
 
        # 4. Xử lý file HTML (Nội dung thủ công hoặc tài liệu Web)
        elif ext == "html":
            with open(file_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Trích xuất ảnh thông minh và thay thế bằng Markdown tag TRỰC TIẾP trong văn bản
            img_tags = soup.find_all('img')
            
            # Debug log file
            debug_log_path = os.path.join(images_dir, "debug_log.txt")
            with open(debug_log_path, "w", encoding="utf-8") as debug_f:
                debug_f.write(f"Starting image extraction for file {file_id}\n")
                debug_f.write(f"Total img tags found: {len(img_tags)}\n")

                for idx, img in enumerate(img_tags):
                    src = img.get('src', '')
                    actual_src = src or img.get('data-src', '')
                    debug_f.write(f"[{idx}] Found img: src='{src}', actual_src='{actual_src}'\n")
                    
                    if not actual_src: 
                        debug_f.write(f"[{idx}] Empty src, skipping\n")
                        continue

                    if actual_src.startswith('//'):
                        actual_src = 'https:' + actual_src
                    
                    try:
                        img_name, img_data = None, None
                        
                        if actual_src.startswith('data:image'):
                            debug_f.write(f"[{idx}] Processing Base64 image\n")
                            header, data = actual_src.split(',', 1)
                            img_ext = header.split('image/')[1].split(';')[0] if 'image/' in header else "png"
                            img_data = base64.b64decode(data)
                            img_name = f"manual_{idx}.{img_ext}"
                        elif actual_src.startswith('http'):
                            debug_f.write(f"[{idx}] Downloading from {actual_src}\n")
                            # Tránh bị rate limit 429
                            time.sleep(1)
                            headers = {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                            }
                            img_res = requests.get(actual_src, headers=headers, timeout=15)
                            debug_f.write(f"[{idx}] Request status: {img_res.status_code}\n")
                            
                            if img_res.status_code == 200:
                                content_type = img_res.headers.get('Content-Type', '')
                                img_ext = content_type.split('/')[-1] if '/' in content_type else "png"
                                if not img_ext or len(img_ext) > 4:
                                    img_ext = actual_src.split('.')[-1].split('?')[0][:4] or "png"
                                
                                img_name = f"web_{idx}.{img_ext}"
                                img_data = img_res.content
                            else:
                                debug_f.write(f"[{idx}] Failed download: status={img_res.status_code}\n")
                        
                        if img_name and img_data:
                            img_path = os.path.join(images_dir, img_name)
                            with open(img_path, "wb") as f:
                                f.write(img_data)
                            
                            # Lấy mô tả ảnh bằng AI
                            description = get_image_description(img_path)
                            
                            rel_url = f"/group_{group_id}/file_{file_id}/images/{img_name}"
                            # Thay thế bằng markdown chứa cả mô tả để Embedding có thêm thông tin
                            img.replace_with(f" [Mô tả ảnh: {description}] ![image]({rel_url}) ")
                            debug_f.write(f"[{idx}] Success: Saved to {img_name} with desc: {description[:30]}...\n")
                    except Exception as ex:
                        debug_f.write(f"[{idx}] Exception: {ex}\n")
                        logging.warning(f"Lỗi khi xử lý ảnh {idx} trong HTML: {ex}")
 
            # Trích xuất văn bản (đã chứa các thẻ ![image](url))
            full_text = soup.get_text(separator='\n')
            for chunk in splitter.split_text(full_text):
                # Tìm danh sách ảnh trong chunk
                import re
                found_imgs = re.findall(r'!\[image\]\((.*?)\)', chunk)
                img_urls = found_imgs if found_imgs else []
                if chunk.strip():
                    chunks.append({"text": chunk.strip(), "images": img_urls, "page": 1})

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
                        "text": batch[j]["text"],
                        "metadata": {
                            "source": file_name,
                            "file_id": file_id,
                            "group_id": group_id,
                            "images": batch[j]["images"],
                            "page": batch[j]["page"]
                        }
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
    file_name: Optional[str] = None

class DeleteRequest(BaseModel): file_id: int
class DeleteGroupRequest(BaseModel): group_id: int
class SearchRequest(BaseModel): 
    query: str
    top_k: int = 5
    group_id: Optional[int] = None

# --- CÁC ROUTE API (ENDPOINTS) ---

@rag_router.post("/process", summary="Bắt đầu xử lý file")
def process_rag(req: ProcessRequest, background_tasks: BackgroundTasks, request: Request):
    """Tiếp nhận file kiến thức và bắt đầu quy trình trích xuất ngầm (Background Task)."""
    kb_qclient = request.app.state.kb_qclient
    background_tasks.add_task(process_document, kb_qclient, req.file_id, req.group_id, req.file_path, req.file_name)
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
        # Bước 0: Xác định danh sách ID các file đang active
        active_file_ids = []
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            if req.group_id is not None:
                cur.execute("SELECT id FROM knowledge_files WHERE group_id = %s AND active = TRUE", (req.group_id,))
            else:
                cur.execute("SELECT id FROM knowledge_files WHERE active = TRUE")
            active_file_ids = [row[0] for row in cur.fetchall()]
            cur.close()
            conn.close()
        except Exception as db_err:
            logging.error(f"Lỗi lấy danh sách file active từ DB: {db_err}")
            # Nếu lỗi DB thì lấy hết (không lọc ID) để tránh làm gián đoạn dịch vụ
            active_file_ids = None
        
        # Bước 1: Chuyển câu hỏi sang vector
        query_emb = get_embeddings([req.query])[0]
        
        # Bước 2: Tìm kiếm sơ bộ trong Qdrant
        # Áp dụng bộ lọc active file_id và group_id
        conditions = []
        if active_file_ids is not None:
            if not active_file_ids: return {"results": []} # Không có file nào active
            conditions.append(FieldCondition(key="file_id", match=MatchAnyValue(any=active_file_ids)))
            
        if req.group_id is not None:
            conditions.append(FieldCondition(key="group_id", match=MatchValue(value=req.group_id)))
            
        query_filter = Filter(must=conditions) if conditions else None

        search_result = kb_qclient.query_points(
            collection_name=COLLECTION_NAME, 
            query=query_emb, 
            limit=20, # Tăng limit để sau rerank vẫn đủ top_k
            with_payload=True,
            query_filter=query_filter
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
                    "metadata": hit.payload.get("metadata", {}),
                    "score": item["relevance_score"]
                })
            return {"results": results}
        
        # Bước 4: Trả về kết quả fallback nếu Reranker lỗi
        return {"results": [{"text": h.payload.get("text"), "metadata": h.payload.get("metadata", {})} for h in search_result[:req.top_k]]}
    except Exception as e:
        logging.error(f"Lỗi tìm kiếm RAG: {e}")
        raise HTTPException(status_code=500, detail=str(e))
