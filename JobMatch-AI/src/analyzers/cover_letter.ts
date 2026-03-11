// src/analyzers/cover_letter.ts
// @ts-ignore - Zypher has no type declarations for npm: imports
import { eachValueFrom } from "rxjs-for-await";
import { createAgent, getModelName } from "../providers.ts";
import type { TaskEventLike, ContentBlock, MessageLike } from "../types.ts";

const FALLBACK_LETTER = `I am writing to express my strong interest in this position. Based on the job description, I believe my background and skills align well with your requirements.

My experience includes relevant technical skills and professional achievements that would make me a valuable addition to your team. I am excited about the opportunity to contribute to your organization.

Thank you for considering my application. I look forward to discussing how my qualifications can benefit your team.`;

function buildPrompt(resumeText: string, jobDescription: string, companyName?: string): string {
  const companyContext = companyName ? `Company: ${companyName}\n\n` : "";
  return `Write a professional cover letter body for the following job.

${companyContext}Job Description:
${jobDescription}

Resume:
${resumeText}

Rules:
- Output ONLY the body paragraphs (no greeting, no closing, no signature)
- 3 paragraphs, 200-300 words total
- Do not include the prompt in the response. Focus on generating a clean cover letter body.
- Paragraph 1: Express interest in the specific role
- Paragraph 2: Highlight 2-3 relevant experiences/skills
- Paragraph 3: Show enthusiasm and call to action
- Use first person ("I", "my")
- Try to generate a letter that would feel personalized to the job/company based on the JD and resume details.
- Try to be human and avoid sounding like a generic template. Use natural language and vary sentence structure.
- Do NOT include "Dear Hiring Manager", "Sincerely", or any name`;
}

// Markers that indicate where the actual letter body begins
const LETTER_START_MARKERS = [
  "I am writing",
  "I'm writing",
  "I wish to apply",
  "I would like to apply",
  "I am excited",
  "I'm excited",
  "I am thrilled",
  "I'm thrilled",
  "I am interested",
  "I'm interested",
  "Having reviewed",
  "After reviewing",
  "With great interest",
  "With enthusiasm",
];

function extractLetterBody(text: string): string {
  // Find the earliest occurrence of any known letter-start phrase
  let earliestIdx = -1;
  for (const marker of LETTER_START_MARKERS) {
    const idx = text.indexOf(marker);
    if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
      earliestIdx = idx;
    }
  }

  if (earliestIdx !== -1) {
    console.log(`  Found letter start at index ${earliestIdx}, trimming prompt echo`);
    return text.substring(earliestIdx).trim();
  }

  // Fallback: find first paragraph that looks like a letter (starts with "I ")
  const paragraphs = text.split(/\n\n+/);
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (p.startsWith("I ") || p.startsWith("I'")) {
      console.log(` Found letter paragraph at index ${i}, trimming prompt echo`);
      return paragraphs.slice(i).join("\n\n").trim();
    }
  }

  return text;
}

function cleanCoverLetter(raw: string): string {
  let text = raw.trim();

  console.log(" Raw LLM output length:", text.length);
  console.log(" Raw LLM output preview:", text.substring(0, 300));

  // Strip markdown code blocks
  text = text.replace(/```[\s\S]*?```/g, "").replace(/^```\w*\n?/gm, "").replace(/\n?```$/gm, "");

  // Unwrap JSON if model returned { "cover_letter": "..." }
  if (text.includes('"cover_letter"') || text.includes('"text"')) {
    try {
      const parsed = JSON.parse(text);
      text = parsed.cover_letter || parsed.text || text;
      console.log("Unwrapped JSON cover letter");
    } catch { /* not JSON, continue */ }
  }

  // ── Key fix: strip prompt echo from the top ──────────────────────────────
  text = extractLetterBody(text);

  // Remove greetings (Dear Hiring Manager, etc.)
  text = text.replace(/^dear\s+[^,\n]+,?\s*/im, "");

  // Remove closing and signature
  text = text.replace(/\n\s*(sincerely|best regards|regards|yours sincerely|yours truly),?\s*(\n\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*)?$/im, "");

  // Deduplicate paragraphs
  const paragraphs = text.split(/\n\n+/);
  const seen = new Set<string>();
  const deduped = paragraphs.filter((p) => {
    const key = p.trim().substring(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result = deduped.join("\n\n").trim();
  console.log(" Cleaned cover letter length:", result.length);
  console.log(" Cleaned preview:", result.substring(0, 200));
  return result;
}

export async function generateCoverLetter(
  resumeText: string,
  jobDescription: string,
  companyName?: string
): Promise<string> {
  const agent = await createAgent();
  const modelName = getModelName();
  const prompt = buildPrompt(resumeText, jobDescription, companyName);

  console.log(` Generating cover letter with model: ${modelName}`);

  let resultText = "";
  try {
    const taskEvents = agent.runTask(prompt, modelName, undefined, { maxIterations: 3 });
    for await (const ev of eachValueFrom(taskEvents)) {
      const e = ev as TaskEventLike;
      if (e.type === "text") {
        resultText += e.content || "";
      } else if (e.type === "message") {
        const blocks = (e.message as MessageLike)?.content || [] as ContentBlock[];
        for (const b of blocks) {
          if (b?.type === "text" && typeof b.text === "string") resultText += b.text;
        }
      } else if (e.type === "error") {
        console.error(" Agent error event:", JSON.stringify(e));
        throw new Error(`Agent task error: ${JSON.stringify(e)}`);
      }
    }
  } catch (err) {
    console.error(" Cover letter generation failed:", err instanceof Error ? err.message : err);
    throw err;
  }

  console.log(` Total raw response length: ${resultText.length}`);

  if (!resultText || resultText.length === 0) {
    console.warn(" Empty response from LLM, using fallback");
    return FALLBACK_LETTER;
  }

  const cleaned = cleanCoverLetter(resultText);

  if (cleaned.length < 100) {
    console.warn(`Cleaned letter too short (${cleaned.length} chars), using fallback`);
    return FALLBACK_LETTER;
  }

  return cleaned;
}