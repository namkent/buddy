import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { v4 as uuidv4 } from "uuid";
import TurndownService from "turndown";
import { exec } from "child_process";
import sharp from "sharp";


import { promisify } from "util";

const execPromise = promisify(exec);


const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

const STORAGE_ROOT = process.env.EXTERNAL_STORAGE_PATH || 
                     (process.env.STORAGE_DIR ? path.join(process.env.STORAGE_DIR, "datas") : path.join(process.cwd(), "..", "external_storage"));

console.log(`\x1b[34m[PARSER]\x1b[0m Storage Root: ${STORAGE_ROOT}`);

/**
 * Trích xuất văn bản và xử lý ảnh từ file (PDF, Docx, Txt, HTML)
 */
export async function parseFile(filePath: string, mimeType: string, fileId: number, groupId: number): Promise<string> {
  // Chuẩn hóa đường dẫn: Nếu là đường dẫn tương đối (từ DB), chuyển về tuyệt đối
  let absolutePath = filePath;
  if (filePath.startsWith("/") || !path.isAbsolute(filePath)) {
    // Loại bỏ dấu / ở đầu nếu có để path.join hoạt động đúng trên Windows
    const relativePath = filePath.startsWith("/") ? filePath.substring(1) : filePath;
    absolutePath = path.join(STORAGE_ROOT, relativePath);
  }

  console.log(`\x1b[34m[PARSER]\x1b[0m Parsing file: ${absolutePath}`);

  const fileFolder = path.join(STORAGE_ROOT, `group_${groupId}`, `file_${fileId}`);
  const imagesFolder = path.join(fileFolder, "images");

  // Đảm bảo thư mục images tồn tại
  if (!fs.existsSync(imagesFolder)) {
    fs.mkdirSync(imagesFolder, { recursive: true });
  }

  if (mimeType === "application/pdf") {
    const relativeUrlPrefix = `/group_${groupId}/file_${fileId}/images`;
    const pythonScript = path.join(__dirname, "pdf_parser.py");
    
    console.log(`\x1b[34m[PARSER]\x1b[0m Processing PDF with PyMuPDF...`);
    
    const pythonCmd = process.env.PYTHON_PATH || "python";
    
    try {
      // Gọi script Python để xử lý PDF
      // Sử dụng dấu ngoặc kép để bao quanh đường dẫn có thể chứa dấu cách
      const { stdout, stderr } = await execPromise(
        `"${pythonCmd}" "${pythonScript}" "${absolutePath}" "${imagesFolder}" "${relativeUrlPrefix}"`
      );

      if (stderr) {
        console.warn(`[PARSER] Python warning/stderr: ${stderr}`);
      }

      const result = JSON.parse(stdout);
      if (result.success) {
        console.log(`\x1b[32m[PARSER]\x1b[0m PDF parsing complete via PyMuPDF (${result.markdown.length} chars)`);
        return result.markdown;
      } else {
        throw new Error(result.error || "Unknown error in Python script");
      }
    } catch (err) {
      console.error(`[PARSER] Failed to parse PDF with PyMuPDF:`, err);
      throw err;
    }
  } 
  
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    // Mammoth convert to HTML và trích xuất ảnh
    const options = {
      convertImage: mammoth.images.inline(async (element: any) => {
        const imageBuffer = await element.read();
        const imageName = `img_${uuidv4()}.jpg`;
        const imagePath = path.join(imagesFolder, imageName);
        
        try {
          await sharp(imageBuffer)
            .jpeg({ quality: 80, mozjpeg: true })
            .toFile(imagePath);
        } catch (err) {
          console.error(`[PARSER] Sharp error processing Docx image:`, err);
          // Fallback if sharp fails
          fs.writeFileSync(imagePath.replace(".jpg", ".png"), imageBuffer);
        }
        
        const finalImageName = fs.existsSync(imagePath) ? imageName : imageName.replace(".jpg", ".png");
        const relativeUrl = `/group_${groupId}/file_${fileId}/images/${finalImageName}`;
        return { src: relativeUrl };
      })
    };

    const result = await mammoth.convertToHtml({ path: absolutePath }, options);
    const markdown = turndownService.turndown(result.value);
    console.log(`\x1b[32m[PARSER]\x1b[0m Processed Docx to Markdown (${markdown.length} chars)`);
    return markdown;
  }

  if (mimeType === "text/plain") {
    return fs.readFileSync(absolutePath, "utf8");
  }

  if (mimeType === "text/html") {
    let html = fs.readFileSync(absolutePath, "utf8");

    const imgRegex = /<img[^>]+src="data:image\/([^;]+);base64,([^"]+)"[^>]*>/g;
    
    const matches = Array.from(html.matchAll(imgRegex));
    for (const match of matches) {
      const [fullMatch, ext, base64Data] = match;
      const imageName = `img_${uuidv4()}.jpg`;
      const imagePath = path.join(imagesFolder, imageName);
      
      try {
        await sharp(Buffer.from(base64Data, 'base64'))
          .jpeg({ quality: 80, mozjpeg: true })
          .toFile(imagePath);
        
        const relativeUrl = `/group_${groupId}/file_${fileId}/images/${imageName}`;
        html = html.replace(fullMatch, fullMatch.replace(/src="[^"]+"/, `src="${relativeUrl}"`));
      } catch (err) {
        console.error(`[PARSER] Sharp error processing HTML image:`, err);
      }
    }

    let markdown = turndownService.turndown(html);
    markdown = markdown.replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]{100,}/g, '[IMAGE_DATA_REMOVED]');
    
    console.log(`\x1b[32m[PARSER]\x1b[0m Processed HTML to Markdown (${markdown.length} chars).`);
    return markdown.trim();
  }

  throw new Error(`Unsupported mime type: ${mimeType}`);
}

export default { parseFile };
