/**
 * src/app/modules/ai/types/ai.types.ts
 *
 * Types for Gemini AI integration across Activity Proposals and Post-Activity Reports.
 */

export interface AIServiceResponse<T = string> {
  success: boolean;
  data?: T;
  error?: string;
  modelUsed?: string;
}

export type AIAssistActionType =
  | 'rewrite_title'
  | 'expand_description'
  | 'polish_grammar'
  | 'generate_objectives'
  | 'generate_indicators'
  | 'generate_mechanics'
  | 'enhance_par_narrative'
  | 'suggest_key_learnings'
  | 'generate_par_recommendations';

export interface AISuggestionOption {
  title: string;
  content: string;
  type?: 'single' | 'multiple';
}

export interface PARRecommendationsOutput {
  programFlow: {
    observations: string;
    recommendations: string;
  };
  participantEngagement: {
    observations: string;
    recommendations: string;
  };
  technicalSetup: {
    observations: string;
    recommendations: string;
  };
  participantPreparedness: {
    observations: string;
    recommendations: string;
  };
}
