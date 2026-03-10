// src/analyzers/jd_resume.ts
// Analyzes a job description against a resume and returns a fit score + skill breakdown

import { createZypherContext, ZypherAgent } from "@corespeed/zypher";
import { eachValueFrom } from "rxjs-for-await";
import { getProvider, getModelName } from "../providers.ts";
import { fallbackParseSkills } from "../tools/local_parser.ts";
import type { JDResumeAnalysis, TaskEventLike, ContentBlock, MessageLike } from "../types.ts";
const NON_TECHNICAL_TERMS = [
  "competitive salaries", "benefits", "benefits package", "salary", "compensation",
  "active startup positions", "startup", "full-time", "part-time", "remote",
  "years of experience", "experience", "degree", "bachelor", "master",
  "communication", "teamwork", "collaboration", "problem-solving", "testing",
  "company culture", "culture", "location", "relocation", "visa sponsorship",
];

function buildPrompt(jdText: string, resumeText: string): string {
  return `Job Description:
${jdText}

Resume:
${resumeText}

Analyze and calculate fit score: (matched_skills / total_required_skills) * 100

CRITICAL RULES FOR SKILLS:
- Skills = ONLY specific technologies, tools, frameworks, programming languages, platforms
- EXCLUDE: benefits, salary, company culture, job type, location, soft skills, generic terms
- matched_skills: ONLY skills explicitly in BOTH JD and resume
- missing_skills: ONLY technical skills from JD NOT found in resume (double-check resume first)

Output JSON only:
{
  "score": <0-100 integer>,
  "matched_skills": [<technical skills in BOTH JD and resume>],
  "missing_skills": [<technical skills from JD NOT in resume>],
  "suggestions": [<3-5 concise actionable suggestions on positioning - not formatting advice>],
  "short_summary": "<brief match explanation in second person using 'you'/'your'>"
}`;
}

function filterSkills(
  skills: string[],
  jdLower: string,
  resumeLower: string,
  mustBeInResume: boolean
): string[] {
  return skills
    .filter((skill) => {
      const s = skill.toLowerCase();
      if (NON_TECHNICAL_TERMS.some((t) => s.includes(t))) return false;
      if (mustBeInResume) return jdLower.includes(s) && resumeLower.includes(s);
      return jdLower.includes(s) && !resumeLower.includes(s);
    })
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function postProcess(parsed: JDResumeAnalysis, jdText: string, resumeText: string): JDResumeAnalysis {
  const jdLower = jdText.toLowerCase();
  const resumeLower = resumeText.toLowerCase();

  parsed.score = Math.min(100, Math.max(0, parsed.score || 0));
  parsed.matched_skills = filterSkills(parsed.matched_skills, jdLower, resumeLower, true);

  // Fix any skills the LLM put in missing that are actually in the resume
  const correctedMissing: string[] = [];
  for (const skill of parsed.missing_skills) {
    const s = skill.toLowerCase();
    if (NON_TECHNICAL_TERMS.some((t) => s.includes(t))) continue;
    if (!jdLower.includes(s)) continue;
    if (resumeLower.includes(s)) {
      if (!parsed.matched_skills.some((m) => m.toLowerCase() === s)) {
        parsed.matched_skills.push(skill);
      }
    } else {
      correctedMissing.push(skill.trim());
    }
  }
  parsed.missing_skills = correctedMissing.filter((s) => s.length > 0);

  return parsed;
}

function buildFallback(jdText: string, resumeText: string): JDResumeAnalysis {
  const jdSkills = fallbackParseSkills(jdText);
  const resumeSkills = fallbackParseSkills(resumeText);
  const matched = jdSkills.filter((s) => resumeSkills.includes(s));
  const missing = jdSkills.filter((s) => !resumeSkills.includes(s));
  const score = Math.round((matched.length / Math.max(1, jdSkills.length)) * 100);

  const suggestions: string[] = [];
  if (missing.length > 0) {
    suggestions.push(`Add experience or projects demonstrating: ${missing.slice(0, 3).join(", ")}`);
    if (missing.length > 3) {
      suggestions.push(`Consider highlighting transferable skills related to: ${missing.slice(3, 5).join(", ")}`);
    }
  }
  if (matched.length > 0) {
    suggestions.push(`Emphasize your experience with: ${matched.slice(0, 3).join(", ")} in your resume summary`);
  }
  if (suggestions.length === 0) {
    suggestions.push("Review the job description and ensure all key requirements are clearly highlighted");
  }

  return {
    score,
    matched_skills: matched,
    missing_skills: missing,
    suggestions,
    short_summary: `Estimated fit: ${score}/100. Matched ${matched.length} skills, missing ${missing.length} skills.`,
  };
}

async function runAgent(prompt: string): Promise<string> {
  const zypherContext = await createZypherContext(Deno.cwd());
  const provider = getProvider();
  const agent = new ZypherAgent(zypherContext, provider);
  const modelName = getModelName();

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
  } catch (err: unknown) {
    const apiErr = err as { status?: number; code?: string };
    if (apiErr.status === 429) console.warn("⚠️  Rate limit hit. Using fallback.");
    else if (apiErr.status === 401) console.error("❌ Auth failed. Using fallback.");
    else console.warn("⚠️  API error. Using fallback.");
    return "";
  }
  return resultText;
}

function parseAgentResponse(resultText: string): JDResumeAnalysis | null {
  if (!resultText || resultText.includes("(error)")) return null;

  const jsonMatch =
    resultText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
    resultText.match(/\{[\s\S]*?\}/) ||
    resultText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    if (parsed?.reply?.includes("(error)")) return null;
    if (parsed.score === undefined || !Array.isArray(parsed.matched_skills)) return null;
    return parsed as JDResumeAnalysis;
  } catch {
    return null;
  }
}

export async function analyzeJDResume(jdText: string, resumeText: string): Promise<JDResumeAnalysis> {
  try {
    const prompt = buildPrompt(jdText, resumeText);
    const resultText = await runAgent(prompt);
    const parsed = parseAgentResponse(resultText);
    if (parsed) return postProcess(parsed, jdText, resumeText);
  } catch (err) {
    console.error("Error in analyzeJDResume:", err);
  }
  return buildFallback(jdText, resumeText);
}