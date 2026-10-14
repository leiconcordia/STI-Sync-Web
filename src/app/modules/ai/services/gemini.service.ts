/**
 * src/app/modules/ai/services/gemini.service.ts
 *
 * Resilient Gemini AI client service with automatic multi-model fallback,
 * token safety, timeout handling, and graceful UI degradation.
 */

import { toast } from 'sonner';

/**
 * Prioritized list of Gemini models for automatic fallback.
 * If the primary model faces rate limits (429), high demand (503), or unavailability,
 * the service automatically iterates down this list.
 */
const MODEL_FALLBACK_CHAIN = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

/**
 * System persona for STI College Student Affairs & Services (SAS) and student organizations.
 */
export const STI_SYSTEM_PROMPT = `
You are the official AI Writing & Proposal Assistant for STI College (Student Affairs & Services - SAS).
Your purpose is to assist student leaders and school officers in drafting, refining, and polishing official institutional Activity Proposals (AP) and Post-Activity Reports (PAR).

Guiding Principles:
1. Tone: Formal, academic, encouraging, professional, and clear.
2. Context: Grounded in Philippine higher education standards and STI College campus guidelines.
3. Clarity: Eliminate grammatical errors, typos, and informal slang, while preserving the user's core intent.
4. Output: Return direct, structured responses without conversational filler (do NOT say "Here is your suggestion:" or "Sure, I can help").
`;

function getApiKey(): string | null {
  const key =
    import.meta.env.VITE_GEMINI_API_KEY ||
    import.meta.env.GEMINI_API_KEY ||
    (typeof process !== 'undefined' ? process.env?.VITE_GEMINI_API_KEY || process.env?.GEMINI_API_KEY : null);

  return key && key.trim().length > 0 ? key.trim() : null;
}

function getEndpoints(model: string, apiKey: string): string[] {
  const direct = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    return [
      `/api/gemini/v1beta/models/${model}:generateContent?key=${apiKey}`,
      direct,
    ];
  }
  return [direct];
}

interface GenerateOptions {
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: 'text/plain' | 'application/json';
  timeoutMs?: number;
}

/**
 * Calls Gemini with automatic fallback across the model chain.
 * Returns null if all models fail or API key is not configured, while showing a toast notice.
 */
export async function callGemini(
  prompt: string,
  options: GenerateOptions = {}
): Promise<{ text: string; model: string } | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    toast.warning('AI Assistant is currently unavailable (API key not configured in .env.local). You can continue writing manually.', {
      id: 'ai-no-key-warning',
    });
    return null;
  }

  const {
    systemInstruction = STI_SYSTEM_PROMPT,
    temperature = 0.7,
    maxOutputTokens = 1500,
    responseMimeType,
    timeoutMs = 15000,
  } = options;

  let lastErrorMessage = '';

  for (const model of MODEL_FALLBACK_CHAIN) {
    const urls = getEndpoints(model, apiKey);

    for (const url of urls) {
      try {
        const body: any = {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature,
            maxOutputTokens,
          },
        };

        if (responseMimeType) {
          body.generationConfig.responseMimeType = responseMimeType;
        }

        if (systemInstruction) {
          body.systemInstruction = {
            parts: [{ text: systemInstruction }],
          };
        }

        // Controller for timeout
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.ok) {
          const data = await response.json();
          const parts = data?.candidates?.[0]?.content?.parts;
          let candidateText = '';

          if (Array.isArray(parts)) {
            candidateText = parts
              .filter((p: any) => typeof p.text === 'string' && !p.thought)
              .map((p: any) => p.text)
              .join('')
              .trim();

            if (!candidateText && parts[0]?.text) {
              candidateText = parts[0].text.trim();
            }
          }

          if (candidateText && candidateText.length > 0) {
            return {
              text: candidateText,
              model,
            };
          }
        }

        const errData = await response.json().catch(() => ({}));
        lastErrorMessage = errData?.error?.message || `HTTP ${response.status}`;
        console.warn(`[GeminiService] Model ${model} via ${url.startsWith('/') ? 'proxy' : 'direct'} returned ${response.status}: ${lastErrorMessage}`);
      } catch (err: any) {
        lastErrorMessage = err?.message || 'Network error';
        console.warn(`[GeminiService] Error with ${model} via ${url.startsWith('/') ? 'proxy' : 'direct'}: ${lastErrorMessage}`);
      }
    }
  }

  // If all models in the fallback chain were exhausted
  console.error('[GeminiService] All Gemini fallback models exhausted:', lastErrorMessage);
  const cleanError = lastErrorMessage ? ` (${lastErrorMessage})` : '';
  toast.warning(`AI Assistant is currently unavailable${cleanError}. You can continue filling out your form manually.`, {
    id: 'ai-fallback-exhausted-toast',
  });
  return null;
}

/**
 * Generate plain text content.
 */
export async function generateText(
  prompt: string,
  options?: Omit<GenerateOptions, 'responseMimeType'>
): Promise<string | null> {
  const result = await callGemini(prompt, {
    ...options,
    responseMimeType: 'text/plain',
  });
  return result?.text || null;
}

/**
 * Generate and parse structured JSON content.
 */
export async function generateJSON<T = any>(
  prompt: string,
  options?: Omit<GenerateOptions, 'responseMimeType'>
): Promise<T | null> {
  const result = await callGemini(prompt, {
    ...options,
    responseMimeType: 'application/json',
  });

  if (!result?.text) return null;

  try {
    // Clean potential markdown fences just in case
    let cleaned = result.text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(cleaned) as T;
  } catch (parseErr) {
    console.error('[GeminiService] JSON Parse Error:', parseErr, result.text);
    return null;
  }
}
