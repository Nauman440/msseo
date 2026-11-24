/** Shared by ai-plan.ts and plan-pipeline.ts (kept apart so neither waits on the other at load time). */
export const TASK_CATEGORIES = ['technical', 'on_page', 'content', 'ai_visibility', 'off_page', 'local', 'tracking'] as const;
/** automatic = software applies it after approval; automatic_no_approval = software applies it straight away (rule 22). */
export const TASK_DOERS = ['automatic', 'automatic_no_approval', 'team', 'developer', 'client'] as const;
