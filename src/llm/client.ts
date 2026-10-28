import type { z } from "zod";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const config = () => ({
  baseUrl: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
  apiKey: process.env.LLM_API_KEY ?? "ollama",
  model: process.env.LLM_MODEL ?? "haunt-gemma",
  // Gemma 4 thinks by default; "none" turns it off on Ollama. Empty string = don't send.
  reasoningEffort: process.env.LLM_REASONING_EFFORT ?? "none",
});

type ChatOptions = {
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: { name: string; schema: object };
  model?: string;
  onProgress?: (text: string) => void;
};

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const { baseUrl, apiKey, model, reasoningEffort } = config();
  const body: Record<string, unknown> = {
    model: opts.model ?? model,
    messages,
    temperature: opts.temperature ?? 0.8,
    max_tokens: opts.maxTokens ?? 4096,
    stream: true,
  };
  if (reasoningEffort) body.reasoning_effort = reasoningEffort;
  if (opts.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: opts.jsonSchema.name, schema: opts.jsonSchema.schema, strict: true },
    };
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`LLM ${res.status}: ${await res.text()}`);

  // server-sent events: "data: {...}\n\n", terminated by "data: [DONE]"
  let text = "";
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      const data = line.replace(/^data:\s*/, "").trim();
      if (!line.startsWith("data:") || !data || data === "[DONE]") continue;
      const delta = JSON.parse(data).choices?.[0]?.delta?.content;
      if (delta) {
        text += delta;
        opts.onProgress?.(text);
      }
    }
  }
  return text;
}

/** Ask for JSON matching `schema`; on parse/validation failure, show the model its errors and retry. */
export async function chatJson<S extends z.ZodType>(
  messages: ChatMessage[],
  schema: S,
  jsonSchema: { name: string; schema: object },
  opts: Omit<ChatOptions, "jsonSchema"> & { retries?: number } = {},
): Promise<z.infer<S>> {
  const convo = [...messages];
  let lastError = "";
  for (let attempt = 0; attempt <= (opts.retries ?? 2); attempt++) {
    const raw = await chat(convo, { ...opts, jsonSchema });
    const parsed = safeJson(raw);
    if (parsed.ok) {
      const result = schema.safeParse(parsed.value);
      if (result.success) return result.data;
      lastError = result.error.issues
        .slice(0, 12)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n");
    } else {
      lastError = `invalid JSON: ${parsed.error}`;
    }
    convo.push(
      { role: "assistant", content: raw },
      { role: "user", content: `That JSON was rejected:\n${lastError}\nReturn the corrected JSON only.` },
    );
  }
  throw new Error(`model never produced valid JSON: ${lastError}`);
}

function safeJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
