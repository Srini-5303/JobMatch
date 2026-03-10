// src/types.ts
// Shared interfaces across the app

export interface JobSearchPreferences {
  role?: string;
  location?: string;
  keywords?: string;
}

export interface ResumeStrengthAnalysis {
  overall_score: number;
  ats_score: number;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  summary: string;
  skill_diversity_score: number;
  experience_depth_score: number;
}

export interface JobSearchResult {
  jobs: import("./tools/job_search.ts").JobListing[];
  totalFound: number;
  searchQuery: string;
}

export interface JDResumeAnalysis {
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  suggestions: string[];
  short_summary: string;
}

// Zypher agent event types
export type ContentBlock = { type?: string; text?: string };
export type MessageLike = { content?: ContentBlock[] };
export type TaskEventLike = { type: string; content?: string; message?: MessageLike };