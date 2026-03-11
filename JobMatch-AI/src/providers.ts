// src/providers.ts

// @ts-ignore - Zypher has no type declarations for npm: imports
import { OpenAIModelProvider, createZypherContext, ZypherAgent } from "@corespeed/zypher";

// ── Windows HOME fix ───────────────────────────────────────────────────────────
// Zypher looks for HOME env var (Unix convention). Windows uses USERPROFILE.
// Set HOME immediately when this module loads — before anything else runs.
if (!Deno.env.get("HOME")) {
  const userProfile = Deno.env.get("USERPROFILE");
  if (userProfile) {
    Deno.env.set("HOME", userProfile);
    console.log(` Set HOME=${userProfile} (Windows compatibility)`);
  } else {
    // Last resort: use the current working directory
    Deno.env.set("HOME", Deno.cwd());
    console.warn("  USERPROFILE not found, using cwd as HOME:", Deno.cwd());
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function getProvider() {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (groqKey) {
    Deno.env.set("OPENAI_BASE_URL", "https://api.groq.com/openai/v1");
    return new OpenAIModelProvider({ apiKey: groqKey });
  }
  Deno.env.delete("OPENAI_BASE_URL");
  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIKey) throw new Error("Set OPENAI_API_KEY or GROQ_API_KEY in environment.");
  return new OpenAIModelProvider({ apiKey: openAIKey });
}

export function getModelName(): string {
  return Deno.env.get("GROQ_API_KEY")
    ? (Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant")
    : (Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini");
}

// ── Cached ZypherContext ───────────────────────────────────────────────────────
// Created once at first use — HOME is already set above so Zypher can find it.

let _contextPromise: ReturnType<typeof createZypherContext> | null = null;

function getZypherContext() {
  if (!_contextPromise) {
    _contextPromise = createZypherContext(Deno.cwd());
  }
  return _contextPromise;
}

// ── Agent Factory ─────────────────────────────────────────────────────────────

export async function createAgent(): Promise<ZypherAgent> {
  const context = await getZypherContext();
  return new ZypherAgent(context, getProvider());
}