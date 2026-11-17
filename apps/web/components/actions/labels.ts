import type { ActionStatus, Approval, Bucket, CheckpointResult, Tone } from '@seo/core';

/** Module 12 labels, shared by the server views and the client forms (not a 'use client' module). */
export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done', verified: 'Verified', dismissed: 'Dismissed' };
export const ACTION_STATUS_TONE: Record<ActionStatus, Tone> = { todo: 'info', in_progress: 'primary', done: 'warn', verified: 'pass', dismissed: 'info' };
export const APPROVAL_LABEL: Record<Approval, string> = { none: 'No approval needed', team_lead: 'Team lead approves', client: 'Client approves' };
export const BUCKET_LABEL: Record<Bucket, string> = { d30: 'Days 1–30', d60: 'Days 31–60', d90: 'Days 61–90' };
export const VERDICT_LABEL: Record<CheckpointResult['verdict'], string> = { fixed: 'Fixed', improved: 'Improved', no_change: 'No change yet', worse: 'Worse', waiting: 'Waiting for data' };
export const VERDICT_TONE: Record<CheckpointResult['verdict'], Tone> = { fixed: 'pass', improved: 'pass', no_change: 'info', worse: 'fail', waiting: 'info' };
