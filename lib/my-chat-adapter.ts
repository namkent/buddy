import type { ChatModelAdapter } from "@assistant-ui/react";

export const myChatAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const startTime = Date.now();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: abortSignal,
    });

    if (!response.body) throw new Error("No response data");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunkCount++;
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;

      yield {
        content: [{ type: "text", text: fullText }],
      };
    }

    const endTime = Date.now();
    const totalStreamTime = endTime - startTime;
    const estimatedTokenCount = Math.ceil(fullText.length / 4);

    yield {
      content: [{ type: "text", text: fullText }],
      metadata: {
        timing: {
          streamStartTime: startTime,
          totalStreamTime,
          tokenCount: estimatedTokenCount,
          tokensPerSecond: estimatedTokenCount / (totalStreamTime / 1000),
          totalChunks: chunkCount,
          toolCallCount: 0,
        },
      },
    };
  },
};