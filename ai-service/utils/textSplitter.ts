import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

/**
 * Chia nhỏ văn bản thành các đoạn (chunks)
 * @param text - Văn bản thô
 * @param chunkSize - Kích thước mỗi đoạn (mặc định 1000)
 * @param chunkOverlap - Độ gối đầu giữa các đoạn (mặc định 200)
 */
export async function splitText(text: string, chunkSize = 1000, chunkOverlap = 200): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ["\n#", "\n##", "\n###", "\n\n", "\n", " ", ""]
  });

  const output = await splitter.splitText(text);
  return output;
}

export default { splitText };
