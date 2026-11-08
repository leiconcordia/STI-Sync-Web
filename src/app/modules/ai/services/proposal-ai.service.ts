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

Write a concise, professional Description & Rationale for this official STI College Activity Proposal.
Structure the description to include:
1. Context & Academic Rationale: Why this event is meaningful for the student body.
2. Core Focus: Targeted competencies or key activity segments.
3. Student Impact: How this aligns with STI's holistic student development.

STRICT RULES:
- Write in formal, third-person academic tone.
- Length: Strictly 1 concise, compact paragraph of 60 to 90 words (2 to 3 sentences maximum). Do NOT write multi-paragraph essays or long text.
- Retain the author's core ideas without inventing unrelated external sponsors or fake guest speakers.
- Output ONLY the final paragraph text without introductory filler or markdown code blocks.
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

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT-FIRST GENERATOR FUNCTIONS (Grounded, Anti-Hallucination)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate 3 formal STI event titles based on a user's theme or creative prompt.
 */
export async function generateTitleFromConcept(
  conceptPrompt: string,
  category?: string
): Promise<string[]> {
  const cleanPrompt = conceptPrompt.trim();
  if (!cleanPrompt) return [];

  const prompt = `
User Concept / Prompt: "${cleanPrompt}"
${category ? `Event Category: ${category}` : ''}

Generate exactly 3 professional, institutional event titles suitable for STI College official proposals.
Tone: Formal, academic, inspiring, and engaging.
Grounding Rule: Do not invent unrelated brand sponsorships or fictional entities.

Output strictly a JSON array of 3 strings:
["Title Option 1", "Title Option 2", "Title Option 3"]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Generate a formal Description & Rationale from a user prompt / notes,
 * strictly grounded in the event title, organizers, and target audience.
 */
export async function createDescriptionFromPrompt(
  title: string,
  userPrompt: string,
  organizers?: string[],
  targetAudienceText?: string
): Promise<string> {
  const prompt = `
Event Title: "${title || 'STI College Activity'}"
${organizers && organizers.length > 0 ? `Organizers: ${organizers.join(', ')}` : ''}
${targetAudienceText ? `Target Audience: ${targetAudienceText}` : ''}
User Guidance / Prompt: "${userPrompt.trim()}"

Write a concise, professional Description & Rationale for this official STI College Activity Proposal.
Include:
1. Purpose & academic/student rationale.
2. Core activity highlights or seminar topics.
3. Expected student development outcome.

STRICT RULES:
- Write in formal, third-person academic tone.
- Length: Strictly 1 concise, compact paragraph of 60 to 90 words (2 to 3 sentences maximum). Do NOT write multi-paragraph essays or long text.
- Ground the rationale strictly in the provided prompt and event context. Do NOT invent outside company names, fictional guest speakers, or arbitrary dates.
- Output ONLY the description text without any conversational preface or markdown formatting.
`;

  const text = await generateText(prompt);
  return text || '';
}

/**
 * Generate SMART objectives based on user guidance prompt and event title.
 * Supports explicit quantity requests (e.g. "generate 5 objectives 1 this 2 this").
 */
export async function generateObjectivesFromPrompt(
  title: string,
  userPrompt?: string,
  description?: string
): Promise<string[]> {
  const prompt = `
Event Title: "${title || 'STI Campus Activity'}"
${description ? `Context / Description: "${description.slice(0, 300)}..."` : ''}
User Request / Guidance: "${userPrompt?.trim() || ''}"

Generate SMART (Specific, Measurable, Achievable, Relevant, Time-bound) objectives for this official STI College Activity Proposal strictly adhering to the user's prompt.

QUANTITY & CONTENT INSTRUCTIONS:
- If the user explicitly requested a specific number of objectives (e.g. "5 objectives", "generate 5 objectives 1 this 2 this"), generate exactly that requested number of objectives matching their points!
- Otherwise, generate exactly 3 SMART objectives.

RULES:
- Every objective must begin with an action verb (e.g. "To equip...", "To cultivate...", "To reinforce...", "To provide...", "To assess...").
- Grounding Rule: Base strictly on the user's prompt and event context. Do NOT invent random, unrelated, or impossible goals.

Output strictly a JSON array of strings:
["Objective 1", "Objective 2", ...]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Enhance author's existing draft objectives into formal SMART objectives.
 * Preserves the author's exact topics, scope, and intent.
 */
export async function enhanceObjectives(
  userObjectives: string[],
  title?: string
): Promise<string[]> {
  const cleanList = userObjectives.map((o) => o.trim()).filter((o) => o.length > 0);
  if (cleanList.length === 0) return [];

  const prompt = `
Event Title: "${title || 'STI College Activity'}"
Author's Existing Objectives:
${cleanList.map((o, i) => `${i + 1}. ${o}`).join('\n')}

Refine and elevate each of the author's draft objectives into formal SMART (Specific, Measurable, Achievable, Relevant, Time-bound) objectives for an official STI College Activity Proposal.

RULES:
- Retain the exact intent, topic, and subject matter of each of the author's draft objectives.
- Begin each objective with a decisive action verb (e.g. "To equip...", "To cultivate...", "To develop...", "To reinforce...", "To establish...").
- Elevate vocabulary to professional STI academic standards while maintaining conciseness.
- Produce a 1-to-1 enhanced version for each item provided by the author (total: exactly ${cleanList.length} items).
- Ground strictly in the provided items. Do NOT hallucinate or add random ungrounded objectives.

Output strictly a JSON array of strings:
["Enhanced Objective 1", ...]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Enhance author's existing draft success indicators into formal quantifiable KPIs.
 */
export async function enhanceSuccessIndicators(
  userIndicators: string[],
  title?: string
): Promise<string[]> {
  const cleanList = userIndicators.map((s) => s.trim()).filter((s) => s.length > 0);
  if (cleanList.length === 0) return [];

  const prompt = `
Event Title: "${title || 'STI College Activity'}"
Author's Existing Success Indicators:
${cleanList.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Refine and elevate the author's draft success indicators into formal, measurable Key Performance Indicators (KPIs) for STI College.

RULES:
- Retain any quantifiable benchmarks, percentages, rating thresholds, or targets the author wrote.
- Standardize phrasing to official institutional metrics (e.g. "Achieve a minimum 85% attendance rate...", "Attain an average evaluation score of 4.2 / 5.0 or higher...").
- Ground strictly in what the author provided. Do NOT invent new unrelated targets.

Output strictly a JSON array of strings:
["Enhanced Indicator 1", ...]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Enhance author's existing draft mechanics into clear, numbered procedure steps.
 */
export async function enhanceMechanics(
  userMechanics: string[],
  title?: string
): Promise<string[]> {
  const cleanList = userMechanics.map((m) => m.trim()).filter((m) => m.length > 0);
  if (cleanList.length === 0) return [];

  const prompt = `
Event Title: "${title || 'STI College Activity'}"
Author's Existing Mechanics / Procedure Steps:
${cleanList.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Polish and structure the author's event mechanics into professional, sequential execution guidelines for this STI activity.

RULES:
- Preserve the author's specific procedures, game rules, sequence, and requirements.
- Clean up typos, awkward syntax, and formatting.
- Ground strictly in the author's draft steps.

Output strictly a JSON array of strings:
["Step 1...", "Step 2...", ...]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Enhance author's existing materials into formal campus logistics inventory items.
 */
export async function enhanceMaterialsList(userMaterials: string[]): Promise<string[]> {
  const cleanList = userMaterials.map((m) => m.trim()).filter((m) => m.length > 0);
  if (cleanList.length === 0) return [];

  const prompt = `
Author's Existing Materials / Equipment Checklist:
${cleanList.map((m) => `- ${m}`).join('\n')}

Standardize these items into formal campus equipment and logistics specifications (e.g., "mic" -> "2 units Wireless Handheld Microphones with Receiver", "projector" -> "1 unit HDMI LCD Projector & Projection Screen").
Rules:
- Ground strictly in the author's items. Clean up terminology and specify standard campus units where appropriate.
- Output strictly a JSON array of strings: ["Item 1", ...]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Enhance author's existing marketing plan tactics into formal promotional strategies.
 */
export async function enhanceMarketingPlan(userMarketing: string[]): Promise<string[]> {
  const cleanList = userMarketing.map((m) => m.trim()).filter((m) => m.length > 0);
  if (cleanList.length === 0) return [];

  const prompt = `
Author's Existing Marketing / Promotion Tactics:
${cleanList.map((m) => `- ${m}`).join('\n')}

Proofread and elevate these promotional strategies into professional campus campaign tactics for STI College.
Rules:
- Preserve the author's intended promotion channels and ideas.
- Output strictly a JSON array of strings.
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Enhance author's existing documentation deliverables into formal Post-Activity Report (PAR) items.
 */
export async function enhanceDocumentationPlan(userDocs: string[]): Promise<string[]> {
  const cleanList = userDocs.map((d) => d.trim()).filter((d) => d.length > 0);
  if (cleanList.length === 0) return [];

  const prompt = `
Author's Existing Documentation Deliverables:
${cleanList.map((d) => `- ${d}`).join('\n')}

Standardize these post-event deliverables into official STI Post-Activity Report (PAR) requirements.
Rules:
- Preserve the author's items. Use formal institutional terminology.
- Output strictly a JSON array of strings.
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Generate measurable Success Indicators based on objectives and user guidance.
 */
export async function generateSuccessIndicatorsFromPrompt(
  title: string,
  objectives: string[],
  userPrompt?: string
): Promise<string[]> {
  const prompt = `
Event Title: "${title || 'STI Campus Activity'}"
Key Objectives:
${objectives.filter(Boolean).map((o, i) => `${i + 1}. ${o}`).join('\n')}
${userPrompt?.trim() ? `User Target Guidance: "${userPrompt.trim()}"` : ''}

Generate 2 to 3 realistic, quantifiable Success Indicators (KPIs) for this STI activity.
Examples: Attendance rates (e.g., "At least 85% attendance..."), post-event satisfaction score (e.g., "Minimum 4.2 / 5.0 rating in SAS evaluation survey..."), or task completion rate.
Grounding Rule: Realistic campus measurements only.

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
 * Generate step-by-step event mechanics based on title and user execution prompt.
 */
export async function generateMechanicsFromPrompt(
  title: string,
  userPrompt?: string,
  description?: string
): Promise<string[]> {
  const prompt = `
Event Title: "${title || 'STI Campus Activity'}"
${description ? `Description: "${description.slice(0, 300)}..."` : ''}
${userPrompt?.trim() ? `Execution Guidelines / Rules: "${userPrompt.trim()}"` : ''}

Generate 4 to 6 sequential, numbered mechanics / execution procedures for this event.
Cover chronological flow:
1. Registration & Preliminaries
2. Opening / Briefing
3. Main Execution / Competition / Workshop Rules
4. Evaluation & Wrap-up

Grounding Rule: Logical, standard campus flow. No fictional vendor requirements.

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
 * Generate standard campus materials & equipment checklist based on activity type and prompt.
 */
export async function generateMaterialsFromPrompt(
  title: string,
  userPrompt?: string,
  activityType?: string
): Promise<string[]> {
  const prompt = `
Event Title: "${title || 'STI Campus Activity'}"
${activityType ? `Activity Type: ${activityType}` : ''}
${userPrompt?.trim() ? `Specific Requirements: "${userPrompt.trim()}"` : ''}

Suggest 4 to 6 essential physical equipment and logistics materials needed on an STI campus for this event (e.g. LCD Projector, sound system, registration logbooks, extension cords, certificates).

Output strictly a JSON array of strings:
["Material 1", "Material 2", "Material 3", "Material 4"]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Generate promotional and marketing strategies based on target audience and prompt.
 */
export async function generateMarketingPlanFromPrompt(
  title: string,
  targetAudienceText?: string,
  userPrompt?: string
): Promise<string[]> {
  const prompt = `
Event Title: "${title || 'STI Campus Activity'}"
${targetAudienceText ? `Target Audience: ${targetAudienceText}` : ''}
${userPrompt?.trim() ? `Marketing Concept: "${userPrompt.trim()}"` : ''}

Suggest 3 to 4 actionable, campus-appropriate marketing and promotion tactics for this activity (e.g. Official Organization Facebook page teaser graphics, classroom announcements during homeroom/advising, campus digital bulletin boards, Discord/MS Teams reminders).

Output strictly a JSON array of strings:
["Promotion Strategy 1", "Promotion Strategy 2", "Promotion Strategy 3"]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * Generate official documentation and output deliverables based on event title and prompt.
 */
export async function generateDocumentationPlanFromPrompt(
  title: string,
  userPrompt?: string
): Promise<string[]> {
  const prompt = `
Event Title: "${title || 'STI Campus Activity'}"
${userPrompt?.trim() ? `Specific Outputs: "${userPrompt.trim()}"` : ''}

Suggest 3 to 4 essential post-event documentation deliverables required for the official STI Post-Activity Report (PAR) (e.g. High-resolution photo documentation of key segments, signed participant attendance sheets, digital evaluation summary reports, liquidation receipts).

Output strictly a JSON array of strings:
["Documentation Deliverable 1", "Documentation Deliverable 2", "Documentation Deliverable 3"]
`;

  const result = await generateJSON<string[]>(prompt);
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}
