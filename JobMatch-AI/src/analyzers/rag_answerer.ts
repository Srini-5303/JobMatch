// src/analyzers/rag_answerer.ts
// RAG-powered open-ended question answerer
// Combines resume + LinkedIn + GitHub + personal statement + JD into a prompt

// @ts-ignore - Zypher has no type declarations for npm: imports
import { Groq } from "groq-sdk";

const groq = new Groq({ apiKey: Deno.env.get("GROQ_API_KEY") });

export interface UserContext {
  resume:            string;
  linkedinSummary:   string;
  githubSummary:     string;
  personalStatement: string;
}

export interface RAGAnswerRequest {
  question: string;
  jd:       string;
  context:  UserContext;
}

export async function answerQuestion(req: RAGAnswerRequest): Promise<string> {
  const { question, jd, context } = req;

  const prompt = `
You are answering a job application question on behalf of the candidate below.
Be specific, genuine, and tailor the answer to the company and role.
Write in first person. 3-5 sentences max. Never mention you are an AI.

=== CANDIDATE RESUME ===
${context.resume}

=== LINKEDIN SUMMARY ===
${context.linkedinSummary}

=== GITHUB PROJECTS ===
${context.githubSummary}

=== CAREER GOALS & PERSONAL STATEMENT ===
${context.personalStatement}

=== JOB DESCRIPTION ===
${jd}

=== APPLICATION QUESTION ===
${question}

Answer:`.trim();

  const response = await groq.chat.completions.create({
    model:    "llama3-70b-8192",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}