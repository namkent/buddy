import dotenv from "dotenv";
dotenv.config();

import AIEngines from "./engines";
import fs from "fs";
import path from "path";

async function cleanupOldModels(activeModels: { task: string, model: string | undefined }[]) {
  const modelsDir = path.resolve(process.env.STORAGE_DIR || "storage", "models", "Xenova");
  if (!fs.existsSync(modelsDir)) return;

  console.log("\x1b[33m[AI-SERVICE]\x1b[0m Checking for unused models to cleanup...");
  
  const activeModelNames = activeModels
    .map(m => m.model?.split("/").pop())
    .filter(Boolean) as string[];
    
  const existingModels = fs.readdirSync(modelsDir);

  for (const modelFolder of existingModels) {
    if (!activeModelNames.includes(modelFolder)) {
      const folderPath = path.join(modelsDir, modelFolder);
      console.log(`\x1b[31m[AI-SERVICE]\x1b[0m Removing unused model: ${modelFolder}`);
      fs.rmSync(folderPath, { recursive: true, force: true });
    }
  }
}

async function downloadAll() {
  const models = [
    { task: "feature-extraction", model: process.env.EMBEDDING_MODEL },
    { task: "text-classification", model: process.env.RERANKING_MODEL },
    { task: "automatic-speech-recognition", model: process.env.STT_MODEL },
    { task: "text-to-audio", model: process.env.TTS_MODEL },
  ];

  // 1. Dọn dẹp trước
  await cleanupOldModels(models);

  console.log("\x1b[35m[AI-SERVICE]\x1b[0m Starting to download Vietnamese-optimized models...");

  // 2. Tải mới
  for (const item of models) {
    if (!item.model) continue;
    try {
      await AIEngines.getPipeline(item.task, item.model);
    } catch (error: any) {
      console.error(`\x1b[31m[AI-SERVICE]\x1b[0m Failed to download ${item.model}:`, error.message);
    }
  }

  const storageBase = process.env.STORAGE_DIR || "storage";
  console.log(`\x1b[32m[AI-SERVICE]\x1b[0m Done! All models are ready in ${storageBase}/models.`);
  process.exit(0);
}

downloadAll();
