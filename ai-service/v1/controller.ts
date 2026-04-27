import { Request, Response } from 'express';
import AIEngines from "../utils/engines";
import { parseFile } from "../utils/parser";
import { splitText } from "../utils/textSplitter";
import { WaveFile } from "wavefile";

/**
 * Health check handler
 */
export const healthCheck = (req: Request, res: Response) => {
  res.json({ status: "ok", service: "mes-ai-service" });
};

/**
 * Embeddings handler
 */
export const getEmbeddings = async (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Text is required" });

  try {
    const model = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
    const pipeline = await AIEngines.getPipeline("feature-extraction", model);
    
    const output = await pipeline(Array.isArray(text) ? text : [text], {
      pooling: "mean",
      normalize: true,
    });

    const vectors = output.tolist();
    res.json({ data: vectors });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Rerank handler
 */
export const rerank = async (req: Request, res: Response) => {
  const { query, documents, topK = 4 } = req.body;
  if (!query || !documents) return res.status(400).json({ error: "Query and documents are required" });

  try {
    const model = process.env.RERANKING_MODEL || "Xenova/ms-marco-MiniLM-L-6-v2";
    const pipeline = await AIEngines.getPipeline("text-classification", model);
    
    const results: any[] = [];
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const text = typeof doc === "string" ? doc : doc.text;
      
      const output = await pipeline(query, { text_pair: text });
      const score = 1 / (1 + Math.exp(-output.logits[0])); // Sigmoid
      
      results.push({
        index: i,
        score: score,
        document: doc
      });
    }

    const reranked = results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    res.json({ data: reranked });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Speech-to-Text handler
 */
export const stt = async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "No audio file provided" });

  try {
    const model = process.env.STT_MODEL || "Xenova/whisper-small";
    const pipeline = await AIEngines.getPipeline("automatic-speech-recognition", model);
    
    const output = await pipeline(req.file.path);
    res.json({ data: output.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Text-to-Speech handler
 */
export const tts = async (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Text is required" });

  try {
    const model = process.env.TTS_MODEL || "Xenova/vits-ljs";
    const pipeline = await AIEngines.getPipeline("text-to-audio", model);
    
    const output = await pipeline(text);
    
    const wav = new WaveFile();
    wav.fromScratch(1, (output as any).sampling_rate, "32f", (output as any).audio);
    
    res.set("Content-Type", "audio/wav");
    res.send(Buffer.from(wav.toBuffer() as any));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Process File handler
 */
export const processFile = async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });

  try {
    console.log(`\x1b[36m[AI-SERVICE]\x1b[0m Processing file: ${req.file.originalname}`);
    const rawText = await parseFile(req.file.path, req.file.mimetype);
    const chunks = await splitText(rawText);
    
    const model = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
    const pipeline = await AIEngines.getPipeline("feature-extraction", model);
    
    const output = await pipeline(chunks, {
      pooling: "mean",
      normalize: true,
    });

    const vectors = output.tolist();
    
    res.json({
      filename: req.file.originalname,
      chunks: chunks.length,
      data: chunks.map((text, i) => ({
        text,
        vector: vectors[i]
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export default {
  healthCheck,
  getEmbeddings,
  rerank,
  stt,
  tts,
  processFile
};
