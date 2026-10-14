/**
 * src/app/modules/ai/services/proposal-ai.service.ts
 *
 * Domain-specific AI assistant logic for STI Activity Proposals (AP) and Post-Activity Reports (PAR).
 */

import { generateJSON, generateText } from './gemini.service';
import type { PARRecommendationsOutput } from '../types/ai.types';

/**
 * Rewrite casual or brief titles (e.g. "christman party", "bball tourna")
 * into 3 professional, institutional title options.
 */
export async function rewriteTitle(inputTitle: string): Promise<string[]> {
  const cleanInput = inputTitle.trim();
  if (!cleanInput) return [];

  const prompt = `
The user typed the following informal, draft, or brief event title:
"${cleanInput}"

Generate exactly 3 professional, polished, institutional event titles suitable for STI College official proposals.
Make them sound formal yet engaging.
Examples of style:
- "STI Annual Christmas Fellowship & Solidarity Gathering"
- "Inter-Program 3-Day Basketball Invitational Tournament"
- "IT Expert Talk: Cybersecurity Awareness & Industry Practice"

Output strictly a JSON array of 3 strings: ["Title 1", "Title 2", "Title 3"]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Expand short notes, bullet points, or rough text into a comprehensive,
 * formal proposal description / rationale adhering to STI guidelines.
 */
export async function expandDescription(
  title: string,
  rawText: string,
  organizers?: string[]
): Promise<string> {
  const prompt = `
Event Title: "${title || 'STI Student Event'}"
${organizers && organizers.length > 0 ? `Organizers: ${organizers.join(', ')}` : ''}

The author provided this brief note / rough description:
"${rawText || 'A campus activity for students.'}"

Write a comprehensive, professional Description & Rationale for this official STI College Activity Proposal.
Structure the description to include:
1. Context & Background: Why this event is relevant and meaningful for the student body.
2. Core Focus: Targeted competencies, interactive segments, or activities.
3. Student Impact: How this aligns with STI's holistic education and student development.

Rules:
- Write in formal, third-person academic tone.
- Fix all typos and grammatical inconsistencies.
- Return 2 to 3 well-written paragraphs.
- Output ONLY the final text without introductory filler or markdown code blocks.
`;

  const text = await generateText(prompt);
  return text || '';
}

/**
 * General polish / grammar enhancer for any text field.
 * Preserves the author's exact meaning while elevating grammar, vocabulary, and flow.
 */
export async function polishGrammar(rawText: string, contextLabel?: string): Promise<string> {
  if (!rawText.trim()) return '';

  const prompt = `
${contextLabel ? `Context: ${contextLabel}` : ''}
Please proofread and polish the following text for an official school activity document:
"${rawText}"

Rules:
- Correct all spelling, grammar, punctuation, and awkward phrasing.
- Retain the original meaning and specific details completely.
- Elevate vocabulary to a clean, formal institutional standard.
- Output ONLY the polished text without any commentary.
`;

  const text = await generateText(prompt);
  return text || '';
}

/**
 * Generate 3 SMART objectives based on the event title and description.
 */
export async function generateObjectives(
  title: string,
  description?: string
): Promise<string[]> {
  const prompt = `
Event Title: "${title || 'Campus Activity'}"
${description ? `Description: "${description}"` : ''}

Generate exactly 3 SMART (Specific, Measurable, Achievable, Relevant, Time-bound) objectives for this official STI College Activity Proposal.
Each objective must start with an action verb (e.g., "To equip...", "To cultivate...", "To provide...").

Output strictly a JSON array of strings:
["Objective 1", "Objective 2", "Objective 3"]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Generate measurable success indicators based on objectives.
 */
export async function generateSuccessIndicators(
  title: string,
  objectives: string[]
): Promise<string[]> {
  const prompt = `
Event Title: "${title || 'Campus Activity'}"
Objectives:
${objectives.filter(Boolean).map((o, i) => `${i + 1}. ${o}`).join('\n')}

Generate 2 to 3 concrete, measurable Success Indicators (Key Performance Indicators) for this STI event.
Include realistic quantifiable targets (e.g. "At least 85% attendance rate...", "Minimum rating of 4.2 / 5.0 in the post-activity evaluation survey...").

Output strictly a JSON array of strings:
["Indicator 1", "Indicator 2"]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Generate step-by-step event mechanics based on title and description.
 */
export async function generateMechanics(
  title: string,
  description?: string
): Promise<string[]> {
  const prompt = `
Event Title: "${title || 'Campus Activity'}"
${description ? `Description: "${description}"` : ''}

Generate 4 to 6 sequential, numbered mechanics / execution guidelines for this activity.
Cover stages such as:
1. Participant registration and ingress.
2. Opening ceremonies / preliminaries.
3. Main activity / tournament rules / workshop flow.
4. Evaluation and feedback collection.
5. Closing ceremonies, certificates, and egress.

Output strictly a JSON array of strings:
["Step 1...", "Step 2...", "Step 3...", "Step 4...", "Step 5..."]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * PAR: Enhance or generate the Achievement Narrative based on actual event flow.
 */
export async function enhancePARNarrative(
  eventTitle: string,
  rawNotes: string,
  registeredCount?: number,
  attendedCount?: number
): Promise<string> {
  const prompt = `
Event: "${eventTitle || 'Campus Activity'}"
Attendance: ${attendedCount ?? 0} attendees out of ${registeredCount ?? 0} registered.
Author's Notes on Actual Execution:
"${rawNotes || 'The event was successfully conducted as planned.'}"

Write a comprehensive, professional Achievement Narrative for the Post-Activity Report (PAR).
Discuss:
- Overall realization of the planned objectives.
- High-level summary of attendee engagement and program flow.
- General reception and success highlights.

Rules:
- Professional past-tense narrative report style.
- 2 well-formed paragraphs.
- Output ONLY the narrative text.
`;

  const text = await generateText(prompt);
  return text || '';
}

/**
 * PAR: Suggest key learnings from the executed activity.
 */
export async function suggestKeyLearnings(
  eventTitle: string,
  actualNotes?: string
): Promise<string[]> {
  const prompt = `
Event: "${eventTitle || 'Campus Activity'}"
Execution Notes: "${actualNotes || ''}"

Generate 3 concise, impactful Key Learnings demonstrated by students and organizers during this STI event.

Output strictly a JSON array of strings:
["Learning 1", "Learning 2", "Learning 3"]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * PAR: Generate official 4 STI Recommendations (Program Flow, Participant Engagement,
 * Technical Setup, Participant Preparedness).
 */
export async function generatePARRecommendations(
  eventTitle: string,
  issuesEncountered?: string,
  actualNotes?: string
): Promise<PARRecommendationsOutput | null> {
  const prompt = `
Event: "${eventTitle || 'Campus Activity'}"
Notes: "${actualNotes || ''}"
Issues Encountered during Event: "${issuesEncountered || 'No major issues, minor pacing delays.'}"

Provide constructive Observations and actionable Recommendations across the 4 official STI Post-Activity Report categories:
1. programFlow: Observations and recommendations regarding scheduling, transitions, and pacing.
2. participantEngagement: Observations and recommendations regarding crowd interaction, participation, and attentiveness.
3. technicalSetup: Observations and recommendations regarding audio-visual equipment, venue facilities, and digital tools.
4. participantPreparedness: Observations and recommendations regarding student readiness, pre-event notices, and requirements.

Output strictly valid JSON with this schema:
{
  "programFlow": { "observations": "...", "recommendations": "..." },
  "participantEngagement": { "observations": "...", "recommendations": "..." },
  "technicalSetup": { "observations": "...", "recommendations": "..." },
  "participantPreparedness": { "observations": "...", "recommendations": "..." }
}
`;

  return await generateJSON<PARRecommendationsOutput>(prompt);
}
