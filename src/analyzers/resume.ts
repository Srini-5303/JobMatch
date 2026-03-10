// src/analyzers/resume.ts
// Analyzes resume quality across multiple dimensions (ATS, skill diversity, etc.)

import { createZypherContext, ZypherAgent } from "@corespeed/zypher";
import { eachValueFrom } from "rxjs-for-await";
import { getProvider, getModelName } from "../providers.ts";
import { fallbackParseSkills } from "../tools/local_parser.ts";
import type { ResumeStrengthAnalysis, TaskEventLike, ContentBlock, MessageLike } from "../types.ts";

const PROMPT = (resumeText: string) => `Analyze this resume and provide a comprehensive strength assessment:

Resume:
${resumeText}

Evaluate on:
1. Overall Quality (0-100): Structure, clarity, professionalism, impact
2. ATS Compatibility (0-100): Formatting, keywords, structure
3. Skill Diversity (0-100): Range and variety of technical skills
4. Experience Depth (0-100): Achievements, quantifiable results

Output JSON only:
{
  "overall_score": <0-100>,
  "ats_score": <0-100>,
  "strengths": [<3-5 key strengths>],
  "weaknesses": [<3-5 key weaknesses>],
  "improvement_suggestions": [<5-7 actionable suggestions>],
  "summary": "<2-3 sentence summary>",
  "skill_diversity_score": <0-100>,
  "experience_depth_score": <0-100>
}`;

function buildFallback(resumeText: string, failureReason: string): ResumeStrengthAnalysis {
  const skills = fallbackParseSkills(resumeText);
  const overallScore = Math.min(100, Math.round((skills.length / 20) * 100));

  let summary = "Basic resume analysis completed. Consider using AI analysis for more detailed insights.";
  if (failureReason.includes("quota") || failureReason.includes("rate limit")) {
    summary = "Basic resume analysis completed. AI analysis temporarily unavailable due to high demand.";
  } else if (failureReason.includes("auth")) {
    summary = "Basic resume analysis completed. AI analysis unavailable due to configuration issue.";
  } else if (failureReason) {
    summary = "Basic resume analysis completed. AI analysis temporarily unavailable.";
  }

  return {
    overall_score: overallScore,
    ats_score: 70,
    strengths: skills.length > 0 ? [`${skills.length} technical skills identified`] : ["Resume structure present"],
    weaknesses: skills.length < 5 ? ["Limited technical skills listed"] : ["Consider adding more quantifiable achievements"],
    improvement_suggestions: [
      "Add more specific technical skills",
      "Include quantifiable achievements",
      "Ensure ATS-friendly formatting",
      "Highlight relevant experience",
      "Add industry keywords",
    ],
    summary,
    skill_diversity_score: Math.min(100, skills.length * 10),
    experience_depth_score: 60,
  };
}

export async function analyzeResumeStrength(resumeText: string): Promise<ResumeStrengthAnalysis> {
  const zypherContext = await createZypherContext(Deno.cwd());
  const provider = getProvider();
  const agent = new ZypherAgent(zypherContext, provider);
  const modelName = getModelName();

  let resultText = "";
  let failureReason = "";

  try {
    const taskEvents = agent.runTask(PROMPT(resumeText), modelName, undefined, { maxIterations: 3 });
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
        failureReason = "Agent task error";
        break;
      }
    }
  } catch (err: unknown) {
    const apiErr = err as { status?: number; code?: string; message?: string };
    if (apiErr.status === 429) failureReason = apiErr.code === "insufficient_quota" ? "quota exceeded" : "rate limit";
    else if (apiErr.status === 401) failureReason = "auth failed";
    else failureReason = err instanceof Error ? err.message : "unknown error";
    resultText = "";
  }

  if (!resultText) return buildFallback(resumeText, failureReason);

  try {
    const jsonMatch =
      resultText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
      resultText.match(/\{[\s\S]*?\}/) ||
      resultText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) return buildFallback(resumeText, "No JSON in response");

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    if (parsed.overall_score === undefined) return buildFallback(resumeText, "Invalid JSON structure");

    return {
      overall_score: Math.min(100, Math.max(0, parsed.overall_score || 0)),
      ats_score: Math.min(100, Math.max(0, parsed.ats_score || 0)),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      improvement_suggestions: Array.isArray(parsed.improvement_suggestions) ? parsed.improvement_suggestions : [],
      summary: parsed.summary || "Resume analysis completed.",
      skill_diversity_score: Math.min(100, Math.max(0, parsed.skill_diversity_score || 0)),
      experience_depth_score: Math.min(100, Math.max(0, parsed.experience_depth_score || 0)),
    };
  } catch {
    return buildFallback(resumeText, "JSON parse error");
  }
}