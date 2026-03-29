import { createOpenAI } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { JSONSchema7, streamText, convertToModelMessages, type UIMessage } from "ai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

export async function POST(req: Request) {
  const { messages, system, tools }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  } = await req.json();

  const result = streamText({
    model: openai.chat(process.env.OPENAI_MODEL || "qwen2.5-coder:7b"),
    messages: await convertToModelMessages(messages),
    system,
    tools: {
      ...frontendTools(tools ?? {}),
    },
    // providerOptions: {
    //   openai: {
    //     reasoningEffort: "low",
    //     reasoningSummary: "auto",
    //   },
    // },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: false,
  });
}
