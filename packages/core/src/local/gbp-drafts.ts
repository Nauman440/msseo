import { z } from 'zod';
import type { OpenAiClient } from '../providers/openai';

/**
 * Drafts for the Business Profile connection: a reply to a review and a "What's new" post. Drafted
 * only when someone clicks "Write with AI"; nothing is sent to Google until a person presses Post.
 * Without OpenAI a plain template is used.
 */
export type ProfileFacts = { name: string; phone: string | null; places: string[]; services: string[]; website: string | null };

export function templateReply(stars: number | null, reviewer: string, b: ProfileFacts): string {
  const first = reviewer.split(/\s+/)[0] && reviewer !== 'A customer' ? ` ${reviewer.split(/\s+/)[0]}` : '';
  if (stars !== null && stars >= 4) return `Thank you${first}! We are glad you were happy with our work, and we appreciate you taking the time to leave a review. — The ${b.name} team`;
  if (stars === 3) return `Thank you for your feedback${first}. We are always working to do better and would love to hear how we could have earned five stars${b.phone ? `: please call us on ${b.phone}` : ''}. — The ${b.name} team`;
  return `${first ? `${first.trim()}, we` : 'We'} are sorry your experience did not meet expectations. We would like to put this right${b.phone ? `: please call us on ${b.phone} and ask for the manager` : ''}. — The ${b.name} team`;
}

export function templatePost(b: ProfileFacts): string {
  const service = b.services[0] ?? 'our services';
  const place = b.places[0] ? ` in ${b.places[0]}` : '';
  return `Need ${service.toLowerCase()}${place}? ${b.name} can help. Get in touch today to book a visit${b.phone ? ` or call ${b.phone}` : ''}.`;
}

const replySchema = { type: 'object', additionalProperties: false, required: ['reply'], properties: { reply: { type: 'string' } } };
const postSchema = { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } };

export async function draftReviewReply(ai: OpenAiClient | null, review: { stars: number | null; comment: string; reviewer: string }, b: ProfileFacts): Promise<{ text: string; tokens: number; ai: boolean }> {
  if (!ai) return { text: templateReply(review.stars, review.reviewer, b), tokens: 0, ai: false };
  const r = await ai.generateJson({
    name: 'review_reply',
    system:
      'Write the business owner\'s public reply to a Google review. 2–4 short sentences, warm and specific to what the review says, no marketing fluff, no emojis, no promises of refunds. ' +
      'For 1–3 stars: apologise, do not argue, invite them to call to put it right. Sign off as "The <business> team". Under 700 characters.',
    user: JSON.stringify({ business: b.name, phone: b.phone, stars: review.stars, reviewer_first_name: review.reviewer.split(/\s+/)[0], review: review.comment.slice(0, 2000) }),
    jsonSchema: replySchema,
    parse: z.object({ reply: z.string() }),
    maxOutputTokens: 400,
    timeoutMs: 30_000,
  });
  return { text: r.data.reply.trim().slice(0, 1500), tokens: r.tokens, ai: true };
}

export async function draftPost(ai: OpenAiClient | null, b: ProfileFacts, topic: string): Promise<{ text: string; tokens: number; ai: boolean }> {
  if (!ai) return { text: templatePost(b), tokens: 0, ai: false };
  const r = await ai.generateJson({
    name: 'business_post',
    system:
      'Write a Google Business Profile "What\'s new" post for a local business. 60–120 words, plain friendly language, one clear call to action at the end, ' +
      'mention the area served once, no hashtags, no phone number (the button handles contact), no prices unless given, nothing that is not in the facts.',
    user: JSON.stringify({ business: b.name, services: b.services.slice(0, 8), areas: b.places.slice(0, 5), topic: topic.slice(0, 300) || 'a seasonal reminder about one main service' }),
    jsonSchema: postSchema,
    parse: z.object({ summary: z.string() }),
    maxOutputTokens: 400,
    timeoutMs: 30_000,
  });
  return { text: r.data.summary.trim().slice(0, 1500), tokens: r.tokens, ai: true };
}
