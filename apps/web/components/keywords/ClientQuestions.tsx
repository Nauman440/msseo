'use client';

import { useActionState } from 'react';
import type { AskClient } from '@seo/core';
import { answerKeywordQuestionAction, type KeywordState } from '@/app/keywords/actions';
import { Message, Submit } from '@/components/competitors/forms';

/** Up to 5 Yes/No questions from the keyword check; each answer changes the next run's filters. */
function Question({ domain, q }: { domain: string; q: AskClient }) {
  const [yes, sayYes] = useActionState<KeywordState>(answerKeywordQuestionAction.bind(null, domain, q.keyword, 'yes'), {});
  const [no, sayNo] = useActionState<KeywordState>(answerKeywordQuestionAction.bind(null, domain, q.keyword, 'no'), {});
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className="min-w-0 flex-1 text-[14.5px]">{q.question}</span>
      <span className="flex items-center gap-2">
        <form action={sayYes}>
          <Submit label="Yes" busy="Saving…" tone="secondary" />
        </form>
        <form action={sayNo}>
          <Submit label="No" busy="Saving…" tone="secondary" />
        </form>
      </span>
      <Message state={yes.ok || yes.error ? yes : no} />
    </li>
  );
}

export function ClientQuestions({ domain, questions }: { domain: string; questions: AskClient[] }) {
  if (!questions.length) return null;
  return (
    <section aria-labelledby="kw-questions" className="rounded-card border border-primary-tint bg-primary-wash px-5 py-4">
      <h2 id="kw-questions" className="font-display text-[18px] font-bold">A few quick questions</h2>
      <p className="mt-1 text-[13.5px] text-ink-2">Your answers decide what the next keyword check keeps.</p>
      <ul className="mt-1 divide-y divide-border">
        {questions.slice(0, 5).map((q) => (
          <Question key={q.keyword} domain={domain} q={q} />
        ))}
      </ul>
    </section>
  );
}
