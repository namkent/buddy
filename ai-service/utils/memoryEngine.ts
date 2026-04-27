import { llm } from "./aiClient";

export interface MemoryFact {
  fact: string;
  category: "persona" | "preference" | "knowledge" | "other";
}

/**
 * Trích xuất các sự thật (Facts) từ tin nhắn của User
 */
export async function extractFactsFromMessage(text: string): Promise<MemoryFact[]> {
  const systemPrompt = `
You are a Memory Extraction AI. Your goal is to extract key facts, preferences, and personal details about the user from their message.

RULES:
1. Extract facts as short, clear sentences in English (e.g., "User is a React developer").
2. Only extract facts that are worth remembering for future conversations (long-term preferences, identity, skills, persistent interests).
3. FILTER TRANSIENT ACTIONS: Avoid recording every single search or temporary question (e.g., instead of "User is searching for Tô Lâm", record "User has a persistent interest in information about Tô Lâm" ONLY IF it seems like a recurring topic).
4. Categorize each fact as: "persona" (who they are), "preference" (what they like/dislike), "knowledge" (what they know), or "other".
5. If the message contains no information worth remembering, return an empty array [].
6. FORMAT: Return a valid JSON array of objects: [{"fact": "...", "category": "..."}]

Example input: "I am Nam, a 28yo dev from Hanoi. I love dark mode. Search for MES documents."
Example output: [
  {"fact": "User's name is Nam", "category": "persona"},
  {"fact": "User is 28 years old", "category": "persona"},
  {"fact": "User is a developer", "category": "persona"},
  {"fact": "User is from Hanoi", "category": "persona"},
  {"fact": "User prefers dark mode UI", "category": "preference"}
]

User Message: "${text}"
`;

  try {
    const response = await llm.chat([
      { role: "system", content: systemPrompt }
    ]);

    if (!response) return [];
    
    // Tìm đoạn JSON trong response
    const jsonMatch = response.match(/\[\s*\{.*\}\s*\]/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return [];
  } catch (error) {
    console.error("[MemoryEngine-ExtractError]:", error);
    return [];
  }
}

/**
 * Hòa trộn hoặc Cập nhật ký ức (Gemini style)
 */
export async function consolidateMemories(oldFact: string, newFact: string): Promise<{ action: "update" | "keep_both" | "ignore", result?: string }> {
  const systemPrompt = `
You are a Memory Consolidation AI. You are given an existing fact and a new fact about a user.
Your job is to decide if they should be merged, if the new one updates the old one, or if they are distinct.

RULES:
1. UPDATE: If the new fact provides more recent or corrected information (e.g., "User lives in Hanoi" vs "User moved to Saigon"), return {"action": "update", "result": "User lives in Saigon"}.
2. MERGE: If they are about the same topic and complement each other, merge them into one concise sentence.
3. KEEP BOTH: If they are distinct enough (e.g., "User likes Pizza" vs "User likes Sushi"), return {"action": "keep_both"}.
4. IGNORE: If the new fact adds nothing new, return {"action": "ignore"}.

FORMAT: Return valid JSON: {"action": "...", "result": "..."}

Old Fact: "${oldFact}"
New Fact: "${newFact}"
`;

  try {
    const response = await llm.chat([{ role: "system", content: systemPrompt }]);
    if (!response) return { action: "keep_both" };
    const jsonMatch = response.match(/\{.*\}/s);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { action: "keep_both" };
  } catch (e) {
    return { action: "keep_both" };
  }
}
