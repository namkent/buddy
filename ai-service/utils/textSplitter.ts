import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// ============================================================
// SMART TEXT SPLITTER
// Tự động nhận diện loại văn bản và áp dụng thuật toán phù hợp:
//  - Văn bản pháp luật VN (Nghị định, Thông tư, Luật...)
//  - Văn bản thông thường (SOP, Manual, Bài báo, Truyện...)
// ============================================================

const LEGAL_THRESHOLD = 3; // Số lượng từ khóa pháp luật tối thiểu để xác định là văn bản pháp luật

/**
 * Nhận diện xem văn bản có phải văn bản pháp luật Việt Nam không.
 * Kiểm tra tần suất xuất hiện của các từ khóa đặc trưng.
 */
function isLegalDocument(text: string): boolean {
  const legalPatterns = [
    /\bĐiều\s+\d+[\.\s]/g,       // Điều 1. / Điều 5 
    /\bKhoản\s+\d+[\.\s]/g,      // Khoản 1. / Khoản 3
    /\bChương\s+[IVXLCDM\w]+/g,  // Chương I / Chương II / Chương 1
    /\bNghị\s+định\b/g,          // Nghị định
    /\bThông\s+tư\b/g,           // Thông tư
    /\bQuyết\s+định\b/g,         // Quyết định
    /\bPháp\s+lệnh\b/g,          // Pháp lệnh
  ];

  let hitCount = 0;
  for (const pattern of legalPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) hitCount++;
  }

  return hitCount >= LEGAL_THRESHOLD;
}

/**
 * Chia văn bản pháp luật VN thành các chunks có ngữ cảnh đầy đủ.
 * Mỗi chunk sẽ có tiêu đề Chương/Điều được gắn tự động vào đầu.
 */
async function splitLegalText(text: string, chunkSize = 1200, chunkOverlap = 150): Promise<string[]> {
  // Regex tìm các ranh giới phân cấp chính (Chương, Điều, Mục)
  const SEPARATOR_REGEX = /(?=\n(?:Chương\s+[IVXLCDM0-9]+|Mục\s+\d+\.|Điều\s+\d+\.))/g;

  // Tách văn bản tại các ranh giới Điều/Chương
  const rawSections = text.split(SEPARATOR_REGEX).filter(s => s.trim().length > 0);

  let currentChapter = "";
  let currentArticle = "";
  const chunks: string[] = [];

  for (const section of rawSections) {
    const trimmed = section.trim();

    // Cập nhật ngữ cảnh Chương hiện tại
    const chapterMatch = trimmed.match(/^(Chương\s+[IVXLCDM0-9]+[^\n]*)/);
    if (chapterMatch) {
      currentChapter = chapterMatch[1].trim();
    }

    // Cập nhật ngữ cảnh Điều hiện tại
    const articleMatch = trimmed.match(/^(Điều\s+\d+\.[^\n]*)/);
    if (articleMatch) {
      currentArticle = articleMatch[1].trim();
    }

    // Nếu section đủ nhỏ, thêm thẳng vào (có kèm header ngữ cảnh)
    if (trimmed.length <= chunkSize) {
      const contextHeader = buildContextHeader(currentChapter, currentArticle, trimmed);
      chunks.push(contextHeader);
    } else {
      // Section quá dài -> cần chia nhỏ tiếp, nhưng vẫn bảo toàn header
      const subSplitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ["\n\n", "\n", " ", ""],
      });
      const subChunks = await subSplitter.splitText(trimmed);
      for (const sub of subChunks) {
        const contextHeader = buildContextHeader(currentChapter, currentArticle, sub);
        chunks.push(contextHeader);
      }
    }
  }

  return chunks.filter(c => c.trim().length > 50);
}

/**
 * Tạo header ngữ cảnh cho chunk pháp luật.
 * Nếu nội dung chunk đã bắt đầu bằng tiêu đề thì không cần chèn thêm.
 */
function buildContextHeader(chapter: string, article: string, content: string): string {
  const alreadyHasHeader = /^(Chương|Điều|Mục)\s+/i.test(content);
  if (alreadyHasHeader || (!chapter && !article)) return content;

  const parts: string[] = [];
  if (chapter) parts.push(chapter);
  if (article && !content.startsWith(article)) parts.push(article);

  if (parts.length === 0) return content;
  return `[${parts.join(" - ")}]\n${content}`;
}

/**
 * Chia văn bản thông thường (SOP, Manual, Bài báo, Truyện...).
 * Dùng RecursiveCharacterTextSplitter tiêu chuẩn của LangChain.
 */
async function splitStandardText(text: string, chunkSize = 1000, chunkOverlap = 200): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ["\n## ", "\n### ", "\n#### ", "\n\n", "\n", " ", ""],
  });
  return splitter.splitText(text);
}

/**
 * SmartTextSplitter - Điểm vào chính.
 * Tự động phân loại văn bản và chọn thuật toán chia tách phù hợp.
 * 
 * @param text - Văn bản thô đầu vào (đã được parse từ PDF/Docx/HTML...)
 * @param chunkSize - Kích thước chunk mong muốn
 * @param chunkOverlap - Độ gối đầu
 * @returns Danh sách các chunk đã được chia tách
 */
export async function splitText(text: string, chunkSize = 1000, chunkOverlap = 200): Promise<string[]> {
  if (isLegalDocument(text)) {
    console.log(`\x1b[36m[SmartSplitter]\x1b[0m Phát hiện văn bản Pháp luật -> Dùng LegalSplitter (chunkSize=${chunkSize + 200})`);
    // Dùng chunk lớn hơn một chút cho văn bản pháp luật để bảo toàn từng Điều
    return splitLegalText(text, chunkSize + 200, chunkOverlap);
  } else {
    console.log(`\x1b[36m[SmartSplitter]\x1b[0m Văn bản thông thường -> Dùng StandardSplitter (chunkSize=${chunkSize})`);
    return splitStandardText(text, chunkSize, chunkOverlap);
  }
}

export default { splitText };
