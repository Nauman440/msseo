import type { KeywordWorkspace } from '@seo/core';
import { QuestionsCard } from './QuestionsCard';
import { QuestionsList } from './QuestionsList';

/** "Questions for AI" sub-tab: the AI questions, then Google's "People also ask" questions per topic. */
export function QuestionsView({ ws }: { ws: KeywordWorkspace }) {
  return (
    <>
      <QuestionsList domain={ws.domain} prompts={ws.prompts} writtenAt={ws.promptsAt} />
      <QuestionsCard ws={ws} />
    </>
  );
}
