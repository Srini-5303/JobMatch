// src/analyzers/cover_letter.ts
// Generates a personalized cover letter from resume + job description

// @ts-ignore - Zypher has no type declarations for npm: imports
import { createZypherContext, ZypherAgent } from "@corespeed/zypher";

// @ts-ignore - rxjs-for-await has no type declarations for npm: imports
import { eachValueFrom } from "rxjs-for-await";
import { getProvider, getModelName } from "../providers.ts";
import type { TaskEventLike, ContentBlock, MessageLike } from "../types.ts";

const FALLBACK_LETTER = `I am writing to express my strong interest in this position. Based on the job description, I believe my background and skills align well with your requirements.

My experience includes relevant technical skills and professional achievements that would make me a valuable addition to your team. I am excited about the opportunity to contribute to your organization.

Thank you for considering my application. I look forward to discussing how my qualifications can benefit your team.`;

function buildPrompt(resumeText: string, jobDescription: string, companyName?: string): string {
  const companyContext = companyName ? `Company: ${companyName}\n\n` : "";
  return `Write a professional cover letter based on the job description and resume below.

${companyContext}Job Description:
${jobDescription}

Resume:
${resumeText}

IMPORTANT: Output ONLY the cover letter body. No greeting, no closing, no signature.

The body should be 3 paragraphs (200-300 words):
- Paragraph 1: Express interest in the specific role
- Paragraph 2: Highlight 2-3 relevant experiences/skills naturally
- Paragraph 3: Show understanding of the role and your potential contribution

Use first person. Be professional and enthusiastic. No placeholders.

Begin your response with the first paragraph now:`;
}

// Remove any leaked prompt instructions, greetings, or closings from LLM output
function cleanCoverLetter(raw: string): string {
  let text = raw.trim();

  // Strip markdown code blocks
  text = text.replace(/```[\s\S]*?```/g, "").replace(/^```\w*\n?/gm, "").replace(/\n?```$/gm, "");

  // Unwrap JSON if model returned { "cover_letter": "..." }
  if (text.includes('"cover_letter"') || text.includes('"text"')) {
    try {
      const parsed = JSON.parse(text);
      text = parsed.cover_letter || parsed.text || text;
    } catch { /* not JSON, continue */ }
  }

  // Remove greetings (Dear Hiring Manager, etc.)
  text = text.replace(/^dear\s+[^,\n]+,?\s*/im, "");

  // Remove closing and signature (Sincerely, / Best regards, + name)
  text = text.replace(/\n\s*(sincerely|best regards|regards|yours sincerely|yours truly),?\s*(\n\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*)?$/im, "");

  // Remove leaked prompt markers
  const promptMarkers = [
    "IMPORTANT:", "Output ONLY", "Begin your response",
    "Job Description:", "Resume:", "Company:",
    "Paragraph 1:", "Paragraph 2:", "Paragraph 3:",
    "Use first person", "Be professional",
  ];
  for (const marker of promptMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) text = text.substring(0, idx).trim();
  }

  // If there are duplicate paragraphs (LLM repeated itself), deduplicate
  const paragraphs = text.split(/\n\n+/);
  const seen = new Set<string>();
  const deduped = paragraphs.filter((p) => {
    const key = p.trim().substring(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.join("\n\n").trim();
}

export async function generateCoverLetter(
  resumeText: string,
  jobDescription: string,
  companyName?: string
): Promise<string> {
  const zypherContext = await createZypherContext(Deno.cwd());
  const provider = getProvider();
  const agent = new ZypherAgent(zypherContext, provider);
  const modelName = getModelName();
  const prompt = buildPrompt(resumeText, jobDescription, companyName);

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
        throw new Error(`Agent task error: ${JSON.stringify(e)}`);
      }
    }
  } catch (err) {
    console.error("Cover letter generation failed:", err instanceof Error ? err.message : err);
    throw err;
  }

  const cleaned = cleanCoverLetter(resultText);
  return cleaned.length >= 100 ? cleaned : FALLBACK_LETTER;
}