import fetch from "node-fetch";
import * as dotenv from "dotenv";

dotenv.config();

type Message = { role: "system" | "user" | "assistant"; content: string };
type JsonObject = Record<string, unknown>;

type Provider = {
  name: string;
  apiKeyEnv: string;
  modelEnv: string;
  url: (model: string) => string;
  headers: (apiKey: string) => Record<string, string>;
  formatBody: (messages: Message[], model: string, maxTokens?: number) => unknown;
  extractResponse: (data: unknown) => string;
};

const providers: Provider[] = [
  {
    name: "gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    url: (model) => `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
    headers: (key) => ({ "Content-Type": "application/json", "x-goog-api-key": key }),
    formatBody: (messages) => ({
      contents: messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
    }),
    extractResponse: (data) => nestedString(data, ["candidates", "0", "content", "parts", "0", "text"]),
  },
  {
    name: "mistral",
    apiKeyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    url: () => "https://api.mistral.ai/v1/chat/completions",
    headers: (key) => ({ "Content-Type": "application/json", Authorization: `Bearer ${key}` }),
    formatBody: (messages, model, maxTokens) => ({
      model,
      messages: messages.map(({ role, content }) => ({ role, content })),
      max_tokens: maxTokens,
    }),
    extractResponse: (data) => nestedString(data, ["choices", "0", "message", "content"]),
  },
  {
    name: "groq",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    url: () => "https://api.groq.com/openai/v1/chat/completions",
    headers: (key) => ({ "Content-Type": "application/json", Authorization: `Bearer ${key}` }),
    formatBody: (messages, model, maxTokens) => ({
      model,
      messages: messages.map(({ role, content }) => ({ role, content })),
      max_tokens: maxTokens,
    }),
    extractResponse: (data) => nestedString(data, ["choices", "0", "message", "content"]),
  },
  {
    name: "openrouter",
    apiKeyEnv: "OPEN_ROUTER_API_KEY",
    modelEnv: "OPEN_ROUTER_MODEL",
    url: () => "https://openrouter.ai/api/v1/chat/completions",
    headers: (key) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "X-Title": "TaxEngine-LLM-Fallback",
    }),
    formatBody: (messages, model, maxTokens) => ({
      model,
      messages: messages.map(({ role, content }) => ({ role, content })),
      max_tokens: maxTokens,
    }),
    extractResponse: (data) => nestedString(data, ["choices", "0", "message", "content"]),
  },
];

export async function callLLMFallback(messages: Message[], maxTokens?: number): Promise<string> {
  for (const provider of providers) {
    const apiKey = process.env[provider.apiKeyEnv];
    const model = process.env[provider.modelEnv];
    if (!apiKey || !model) {
      console.warn(`Skipping ${provider.name}: configure ${provider.apiKeyEnv} and ${provider.modelEnv}`);
      continue;
    }
    try {
      const response = await fetch(provider.url(model), {
        method: "POST",
        headers: provider.headers(apiKey),
        body: JSON.stringify(provider.formatBody(messages, model, maxTokens)),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        console.warn(`${provider.name} responded with ${response.status}`);
        continue;
      }
      const result = provider.extractResponse(await response.json());
      if (result) return result;
    } catch (error) {
      console.warn(`Error calling ${provider.name}:`, error);
    }
  }
  throw new Error("All configured LLM providers failed or are misconfigured");
}

function nestedString(value: unknown, path: string[]): string {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return "";
    current = (current as JsonObject)[key];
  }
  return typeof current === "string" ? current : "";
}
