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

export type ReportModel = {
  auditId: string;
  brand: string;
  project: { name: string; domain: string };
  url: string;
  audience: Audience;
  pagesCrawled: number;
  crawlLimit: number;
  crawledAt: string;
  gscProperty: string | null;
  overall: { score: number; label: ScoreLabel; afterFixes: number };
  categories: { id: Category; label: string; score: number }[];
  severityCounts: Record<Exclude<Severity, 'info'>, number>;
  pageHealth: { healthy: number; warnings: number; errors: number };
  cwv: { source: 'field' | 'lab'; device: 'mobile'; metrics: CwvMetric[] };
  topIssues: TopIssue[];
  robots: { found: boolean; rows: CheckRow[]; suggested: string };
  sitemap: { found: boolean; url: string; rows: CheckRow[]; segments: Segment[] };
  cards: CheckCard[];
};
