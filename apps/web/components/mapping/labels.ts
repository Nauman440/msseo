import type { MappingAction, MappingStatus } from '@seo/core';

/** Module 5 labels, shared by the server view and the client forms. */
export const ACTION_LABEL: Record<MappingAction, string> = {
  optimise: 'Optimise the page',
  expand: 'Expand the content',
  merge: 'Merge competing pages',
  create: 'Create a new page',
  leave: 'Leave as it is',
};
export const STATUS_LABEL: Record<MappingStatus, string> = { todo: 'To do', in_progress: 'In progress', live: 'Live', verified: 'Verified' };
