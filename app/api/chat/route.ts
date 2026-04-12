import { createOpenAI } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { JSONSchema7, streamText, convertToModelMessages, type UIMessage } from "ai";

const openai = createOpenAI({
  apiKey: process.env.GROQ_KEY,
  baseURL: process.env.GROQ_BASE_URL,
});

export async function POST(req: Request) {
  const { messages, system, tools }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  } = await req.json();

  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { userId, userName, email, avatar } = session.user as any;

  const result = streamText({
    model: openai.chat(process.env.GROQ_MODEL || "llama-3.3-70b-versatile"),
    messages: await convertToModelMessages(messages),
    system:
    `Role: You are the SDV MES Portal AI Assistant. You are chatting with: ${userName} (Email: ${email}). You act as a brilliant, empathetic, and proactive "AI Colleague" rather than a rigid machine.`,
    tools: {
      ...frontendTools(tools ?? {}),
    },
    providerOptions: {
      openai: {
        reasoningEffort: "none",
        reasoningSummary: "auto",
      },
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}
