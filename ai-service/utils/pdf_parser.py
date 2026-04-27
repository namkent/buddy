import sys
import os
import json
import fitz  # PyMuPDF
import uuid
from PIL import Image
import io


def parse_pdf(file_path, images_folder, relative_url_prefix):
    try:
        doc = fitz.open(file_path)
        full_markdown = ""
        
        # Ensure images folder exists
        if not os.path.exists(images_folder):
            os.makedirs(images_folder, exist_ok=True)

        for page_index in range(len(doc)):
            page = doc[page_index]
            page_num = page_index + 1
            
            # Extract text
            text = page.get_text("text")
            
            # Extract images
            images = []
            image_list = page.get_images(full=True)
            
            for img_index, img in enumerate(image_list):
                xref = img[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                
                

                # Filter small images (icons, etc.)
                if base_image["width"] < 50 or base_image["height"] < 50:
                    continue
                
                image_name = f"img_p{page_num}_{img_index}_{uuid.uuid4().hex[:8]}.jpg"
                image_path = os.path.join(images_folder, image_name)
                
                # Convert and save as optimized JPEG
                try:
                    img_data = io.BytesIO(image_bytes)
                    with Image.open(img_data) as pil_img:
                        # Convert to RGB (required for JPEG)
                        if pil_img.mode in ("RGBA", "P"):
                            pil_img = pil_img.convert("RGB")
                        
                        pil_img.save(image_path, "JPEG", quality=80, optimize=True)
                except Exception as img_err:
                    # Fallback: if PIL fails, try saving raw if it's already a usable format
                    with open(image_path, "wb") as f:
                        f.write(image_bytes)

                
                relative_url = f"{relative_url_prefix}/{image_name}"
                images.append(f"![image]({relative_url})")
            
            page_markdown = f"## Page {page_num}\n\n{text}\n\n"
            if images:
                page_markdown += "\n".join(images) + "\n\n"
            
            full_markdown += page_markdown

        doc.close()
        return {"success": True, "markdown": full_markdown}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"success": False, "error": "Missing arguments"}))
        sys.exit(1)

    file_path = sys.argv[1]
    images_folder = sys.argv[2]
    relative_url_prefix = sys.argv[3]

    result = parse_pdf(file_path, images_folder, relative_url_prefix)
    print(json.dumps(result))
