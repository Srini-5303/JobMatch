// src/providers.ts
// LLM provider and model selection logic

// @ts-ignore - OpenAIModelProvider has no type declarations for npm: imports
import { OpenAIModelProvider } from "@corespeed/zypher";

/**
 * Creates the appropriate model provider based on available env keys.
 * Prefers Groq (LLaMA) over OpenAI if both are set.
 */
export function getProvider() {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (groqKey) {
    Deno.env.set("OPENAI_BASE_URL", "https://api.groq.com/openai/v1");
    return new OpenAIModelProvider({ apiKey: groqKey });
  }

  Deno.env.delete("OPENAI_BASE_URL");
  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIKey) {
    throw new Error("Set OPENAI_API_KEY or GROQ_API_KEY in environment.");
  }
  return new OpenAIModelProvider({ apiKey: openAIKey });
}

/**
 * Returns the model name to use based on available env keys.
 */
export function getModelName(): string {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (groqKey) {
    return Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant";
  }
  return Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
}

/**
 * Returns whether Groq is being used as the provider.
 */
export function isUsingGroq(): boolean {
  return !!Deno.env.get("GROQ_API_KEY");
}