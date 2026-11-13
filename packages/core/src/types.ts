export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type RuleStatus = 'pass' | 'warn' | 'fail' | 'info' | 'skipped' | 'manual';

export type Audience = 'client' | 'expert';

export type Category = 'technical' | 'speed' | 'mobile' | 'security' | 'onpage' | 'trust' | 'ai';

export type RuleMethod = 'auto' | 'gsc' | 'ai' | 'manual';

export type RuleSource = 'crawl' | 'preflight' | 'sitemap' | 'lighthouse' | 'gsc' | 'ai';

export type AudienceText = { client: string; expert: string };

type OneToFive = 1 | 2 | 3 | 4 | 5;

export type Ice = { impact: OneToFive; confidence: OneToFive; effort: OneToFive };

export type RuleResult = {
  ruleId: string;
  status: RuleStatus;
  severity: Severity;
  affectedCount?: number;
  applicableCount?: number;
  examples: { url: string; detail?: string }[];
  metrics?: Record<string, number | string>;
  message: AudienceText;
};

/** Static metadata the report needs about a rule, without its evaluate() function. */
export type RuleMeta = {
  id: string;
  module: number;
  category: Category;
  title: AudienceText;
  method: RuleMethod;
  scope: 'site' | 'page';
  weight?: number;
  explain: AudienceText;
  fix: AudienceText;
  ice: Ice;
};

export type ScoreLabel = 'Good' | 'Needs work' | 'Poor' | 'Critical';

export type CwvRating = 'good' | 'needs-improvement' | 'poor';

export type CwvMetric = {
  id: 'lcp' | 'inp' | 'cls' | 'ttfb';
  label: string;
  value: string;
  threshold: string;
  rating: CwvRating;
};

export type Tone = 'pass' | 'warn' | 'high' | 'fail' | 'info' | 'primary';

export type Segment = { label: string; value: number; tone: Tone };

export type CheckRow = {
  ruleId: string;
  status: RuleStatus;
  severity: Severity;
  message: AudienceText;
  url?: string;
  sub?: AudienceText;
  affectedCount?: number;
};

export type CheckChart =
  | { kind: 'stacked'; segments: Segment[] }
  | { kind: 'hbar'; rows: Segment[] };

export type CheckCard = {
  id: string;
  title: string;
  section: 'technical' | 'onpage' | 'gsc';
  expertOnly?: boolean;
  chart?: CheckChart;
  rows: CheckRow[];
};

export type TopIssue = {
  ruleId: string;
  severity: Severity;
  title: AudienceText;
  sub: AudienceText;
  category: Category;
  ice: Ice;
};

/** One warn/fail rule with everything needed to fix it (feeds the Markdown export and AI). */
export type ReportIssue = {
  ruleId: string;
  category: Category;
  severity: Severity;
  status: RuleStatus;
  title: AudienceText;
  message: AudienceText;
  explain: AudienceText;
  fix: AudienceText;
  affectedCount?: number;
  applicableCount?: number;
  /** Every affected URL (capped at 500). */
  urls: string[];
  ice: Ice;
};

export type AiLevel = 'low' | 'medium' | 'high';

export type AiRecommendation = {
  title: string;
  why: string;
  steps: string[];
  ruleIds: string[];
  impact: AiLevel;
  effort: AiLevel;
};

/** Recommendations written by an LLM from the audit findings. */
export type AiRecommendations = {
  provider: 'openai';
  model: string;
  generatedAt: string;
  summary: AudienceText;
  items: AiRecommendation[];
};

export type ReportModel = {
  auditId: string;
  brand: string;
  project: { name: string; domain: string };
  url: string;
  audience: Audience;
  pagesCrawled: number;
  crawlLimit: number;
  crawledAt: string;
  /** Wall-clock time from audit start to finished report. */
  durationSeconds?: number;
  gscProperty: string | null;
  overall: { score: number; label: ScoreLabel; afterFixes: number };
  categories: { id: Category; label: string; score: number }[];
  severityCounts: Record<Exclude<Severity, 'info'>, number>;
  pageHealth: { healthy: number; warnings: number; errors: number };
  cwv: { source: 'field' | 'lab'; device: 'mobile'; metrics: CwvMetric[] } | null;
  topIssues: TopIssue[];
  robots: { found: boolean; rows: CheckRow[]; suggested: string };
  sitemap: { found: boolean; url: string; rows: CheckRow[]; segments: Segment[] };
  cards: CheckCard[];
  /** All issues, sorted like topIssues. Missing on reports saved before it existed. */
  issues?: ReportIssue[];
  ai?: AiRecommendations;
  /** Caveats shown above the report, e.g. when pages could not be crawled. */
  notices?: AudienceText[];
};
