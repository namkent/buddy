import swaggerAutogen from "swagger-autogen";
import path from "path";
import { fileURLToPath } from 'url';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

const doc = {
  info: {
    title: "MES AI Service API",
    description: "API cho Embedding, Reranking, STT và TTS sử dụng Transformers.js",
  },
  host: "localhost:3005",
  schemes: ["http"],
};

const outputFile = path.join(__dirname, "swagger_output.json");
const endpointsFiles = [path.join(__dirname, "../v1/routes.ts")];

const autogen = swaggerAutogen();
autogen(outputFile, endpointsFiles, doc).then(() => {
  console.log("Swagger documentation generated successfully.");
});
