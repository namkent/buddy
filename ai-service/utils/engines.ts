import path from "path";
import fs from "fs";

class AIEngines {
  static #pipelines: Record<string, any> = {};
  static #cacheDir = path.resolve(process.env.STORAGE_DIR || "storage", "models");
  static #fallbackHost = "https://cdn.anythingllm.com/support/models/";

  static async getPipeline(task: string, model: string): Promise<any> {
    const key = `${task}:${model}`;
    if (this.#pipelines[key]) return this.#pipelines[key];

    console.log(`\x1b[36m[AI-Engines]\x1b[0m Loading pipeline: ${task} with ${model}...`);
    
    // Xenova/transformers uses dynamic import for better compatibility in TS
    const { pipeline, env } = await import("@xenova/transformers");
    
    // Configure cache directory
    (env as any).cacheDir = this.#cacheDir;
    (env as any).allowLocalModels = true;
    if (!fs.existsSync(this.#cacheDir)) fs.mkdirSync(this.#cacheDir, { recursive: true });

    const loadPipeline = async (remoteHost: string | null = null) => {
      if (remoteHost) {
        console.log(`\x1b[33m[AI-Engines]\x1b[0m Attempting to load from fallback: ${remoteHost}`);
        (env as any).remoteHost = remoteHost;
        (env as any).remotePathTemplate = "{model}/";
      }

      return await pipeline(task as any, model, {
        progress_callback: (data: any) => {
          if (data.status === "progress") {
            process.stdout.write(`\x1b[36m[AI-Engines - Download]\x1b[0m ${data.file}: ${data.progress.toFixed(2)}%\r`);
          }
        }
      });
    };

    try {
      const p = await loadPipeline();
      this.#pipelines[key] = p;
      console.log(`\n\x1b[32m[AI-Engines]\x1b[0m Pipeline ${key} loaded successfully.`);
      return p;
    } catch (error: any) {
      console.error(`\x1b[31m[AI-Engines]\x1b[0m Primary host failed for ${model}:`, error.message);
      
      try {
        // Thử lại với fallback host
        const p = await loadPipeline(this.#fallbackHost);
        this.#pipelines[key] = p;
        console.log(`\n\x1b[32m[AI-Engines]\x1b[0m Pipeline ${key} loaded from fallback.`);
        return p;
      } catch (fallbackError: any) {
        console.error(`\x1b[31m[AI-Engines]\x1b[0m Fallback also failed:`, fallbackError.message);
        throw fallbackError;
      }
    }
  }
}

export default AIEngines;
