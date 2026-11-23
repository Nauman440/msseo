import type { KeywordWorkspace } from '@seo/core';
import { QuestionsCard } from './QuestionsCard';
import { QuestionsList } from './QuestionsList';

/** Questions for AI (folded at the bottom of Keywords): the questions to track, then Google's "People also ask" per topic. */
export function QuestionsView({ ws }: { ws: KeywordWorkspace }) {
  return (
    <div className="flex flex-col gap-[22px]">
      <QuestionsList domain={ws.domain} prompts={ws.prompts} writtenAt={ws.promptsAt} />
      <QuestionsCard ws={ws} />
    </div>
  );
}
