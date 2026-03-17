// src/jobs/search.ts
// Searches for jobs via Tavily and ranks them against the user's resume

import { searchJobs, extractJobContent, type JobListing } from "../tools/job_search.ts";
import { analyzeJDResume } from "../analyzers/jd_resume.ts";
import type { JobSearchPreferences, JobSearchResult } from "../types.ts";

const JOB_BOARD_NAMES = [
  "linkedin", "indeed", "glassdoor", "monster", "ziprecruiter", "simplyhired",
  "careerbuilder", "snagajob", "eluta", "workopolis", "dice", "builtin",
  "crunchboard", "hired", "arc.dev", "authenticjobs", "stackoverflow",
  "triplebyte", "jobright", "devjobsscanner", "levels.fyi", "wellfound",
  "angel.co", "weworkremotely", "flexjobs", "remote.co", "remotive",
  "remoteok", "relocate.me", "python.org", "golang.cafe", "ycombinator",
  "reddit.com/r/python", "reddit.com/r/golang", "reddit.com/r/forhire", "reddit.com/r/jobbit",
  "aijobs", "aijobsboard", "ai-jobs.net", "jobgether", "otta.com",
  "cord.co", "talent.com", "joblist", "jooble", "careerjet",
  "getwork", "lensa", "themuse", "idealist", "clearancejobs", "simplify.jobs", "simplify.com",       
  "swelist.com","coderquad",          
];

function isJobBoard(url: string): boolean {
  const lower = url.toLowerCase();
  return JOB_BOARD_NAMES.some((name) => lower.includes(name));
}
 
const JOB_ID_PATTERNS = [
  /\/\d{3,}/,
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  /\/[a-z0-9-]{10,}$/i,
];

const CAREER_INDEX_PATTERNS = [
  /\/careers\/?(\?.*)?$/,
  /\/careers\/[a-z-]{1,20}\/?(\?.*)?$/,
  /\/jobs\/?(\?.*)?$/,
  /\/open-roles\/?$/,
  /\/join-us\/?$/,
  /\/work-with-us\/?$/,
];

function isSpecificJobPosting(url: string): boolean {
  const hasId = JOB_ID_PATTERNS.some(p => p.test(url));
  const isIndex = CAREER_INDEX_PATTERNS.some(p => p.test(url));
  return hasId && !isIndex;
}

async function fetchJobDescription(result: {
  url: string;
  snippet: string;
  content?: string;
}): Promise<string> {
  const existing = result.content || result.snippet;
  if (existing.length >= 200) return existing;
  const fetched = await extractJobContent(result.url);
  return fetched.length > existing.length ? fetched : existing;
}

export async function searchAndRankJobs(
  resumeText: string,
  preferences: JobSearchPreferences
): Promise<JobSearchResult> {
  const role = preferences.role || "Machine Learning Engineer";
  const searchQuery = preferences.keywords ? `${role} ${preferences.keywords}` : role;
  const fullQuery = `${searchQuery}${preferences.location ? ` ${preferences.location}` : ""}`;

  try {
    const rawResults = await searchJobs(searchQuery, preferences.location, 10);
    if (rawResults.length === 0) {
      return { jobs: [], totalFound: 0, searchQuery: fullQuery };
    }

    // Filter out job boards — surface direct company postings only
    const filtered = rawResults.filter((r) => !isJobBoard(r.url) && isSpecificJobPosting(r.url));
    if (filtered.length === 0) {
      return { jobs: [], totalFound: rawResults.length, searchQuery: fullQuery };
    }

    // Analyze top 3 jobs (LLM call per job — keep bounded)
    const toAnalyze = filtered.slice(0, 3);
    const ranked: JobListing[] = [];

    for (const result of toAnalyze) {
      try {
        const jobDescription = await fetchJobDescription(result);
        const analysis = await analyzeJDResume(jobDescription, resumeText);

        const titleParts = result.title.split(" - ");
        const company = titleParts.length > 1 ? titleParts[1] : undefined;
        const url = result.url?.trim() || "#";

        ranked.push({
          title: result.title,
          company,
          url,
          description: jobDescription.substring(0, 500),
          score: Math.min(100, Math.max(0, analysis.score || 0)),
          matchDetails: {
            matched_skills: analysis.matched_skills || [],
            missing_skills: analysis.missing_skills || [],
          },
        });
      } catch (err) {
        console.warn(`Failed to analyze job "${result.title}":`, err);
        ranked.push({ title: result.title, url: result.url, description: result.snippet, score: 0 });
      }
    }

    ranked.sort((a, b) => (b.score || 0) - (a.score || 0));
    return { jobs: ranked, totalFound: rawResults.length, searchQuery: fullQuery };

  } catch (err) {
    console.error("Error in searchAndRankJobs:", err);
    return { jobs: [], totalFound: 0, searchQuery: fullQuery };
  }
}