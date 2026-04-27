import express from "express";
import controller from "./controller";
import ragController from "./ragController";
import memoryController from "./memoryController";
import multer from "multer";
import { sseManager } from "../utils/sse";

const router = express.Router();
const upload = multer({ dest: "storage/tmp/" });

/**
 * @swagger
 * /health:
 *   get:
 *     description: Health check
 */
router.get("/health", controller.healthCheck);

/**
 * SSE route for real-time progress updates for a specific group
 */
router.get("/rag/events/:groupId", (req, res) => {
  const { groupId } = req.params;
  
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  sseManager.addConnection(groupId, res);
});

/**
 * @swagger
 * /v1/embeddings:
 *   post:
 *     description: Generate embeddings for text
 */
router.post("/embeddings", controller.getEmbeddings);

/**
 * @swagger
 * /v1/rerank:
 *   post:
 *     description: Rerank documents based on a query
 */
router.post("/rerank", controller.rerank);

/**
 * @swagger
 * /v1/stt:
 *   post:
 *     description: Speech to text
 */
router.post("/stt", upload.single("file"), controller.stt);

/**
 * @swagger
 * /v1/tts:
 *   post:
 *     description: Text to speech
 */
router.post("/tts", controller.tts);

/**
 * @swagger
 * /v1/process-file:
 *   post:
 *     description: Pipeline to parse, split and embed a file
 */
router.post("/process-file", upload.single("file"), controller.processFile);

// RAG Endpoints
/**
 * @swagger
 * /v1/rag/process:
 *   post:
 *     description: Process a file for RAG (Internal usage)
 */
router.post("/rag/process", ragController.processRagFile);

/**
 * @swagger
 * /v1/rag/search:
 *   post:
 *     description: Vector search in knowledge base
 */
router.post("/rag/search", ragController.searchRag);

/**
 * @swagger
 * /v1/rag/sync:
 *   post:
 *     description: Sync and cleanup vector database
 */
router.post("/rag/sync", ragController.syncRag);

/**
 * @swagger
 * /v1/rag/delete-file/:id:
 *   delete:
 *     description: Delete RAG data for a specific file
 */
router.delete("/rag/delete-file/:id", ragController.deleteFileRag);

// Memory (Mem0) Endpoints
/**
 * @swagger
 * /v1/memories:
 *   post:
 *     description: Add a long-term memory for a user
 */
router.post("/memories", memoryController.addMemory);

/**
 * @swagger
 * /v1/memories/search:
 *   post:
 *     description: Search relevant memories for a user
 */
router.post("/memories/search", memoryController.searchMemory);

/**
 * @swagger
 * /v1/memories/:user_id:
 *   delete:
 *     description: Clear all memories for a user
 */
router.delete("/memories/:user_id", memoryController.clearMemories);

export default router;
