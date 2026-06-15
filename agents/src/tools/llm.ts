import { ChatGroq } from "@langchain/groq";

// ─────────────────────────────────────────────────────────────────────────────
// Shared LLM client — Groq (free tier, llama-3.3-70b-versatile)
// Get your free API key at: https://console.groq.com
// ─────────────────────────────────────────────────────────────────────────────

let _groq: ChatGroq | null = null;

export function getLLM(): ChatGroq {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY not set — get a free key at https://console.groq.com");
    _groq = new ChatGroq({
      apiKey,
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      maxTokens: 512,
    });
  }
  return _groq;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — call LLM and return plain text
// ─────────────────────────────────────────────────────────────────────────────

export async function callLLM(prompt: string): Promise<string> {
  try {
    const llm = getLLM();
    const response = await llm.invoke([{ role: "user", content: prompt }]);
    const content = response.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((c: any) => (typeof c === "string" ? c : c.text ?? ""))
        .join("")
        .trim();
    }
    return "";
  } catch (err: any) {
    // Groq rate limits or network issues — return a safe fallback
    console.warn("[LLM] call failed, using fallback:", err.message?.slice(0, 80));
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — call LLM and parse JSON response (strips markdown fences)
// ─────────────────────────────────────────────────────────────────────────────

export async function callLLMJSON<T = Record<string, unknown>>(
  prompt: string,
  fallback: T
): Promise<T> {
  try {
    const raw = await callLLM(prompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}
