/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface Point {
  x: number;
  y: number;
}

export interface Vector {
  vx: number;
  vy: number;
}

export type BubbleColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';
export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Infinity';

export interface Bubble {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  color: BubbleColor;
  active: boolean; // if false, popped
  isFloating?: boolean; // For animation
  popTime?: number; // Timestamp for pop animation
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface UserProfile {
  name: string;
  className: string;
  topic: string;
  difficulty: Difficulty;
  customQuestions?: QuizQuestion[]; // Added for Teacher Mode
}

export interface QuizQuestion {
  question: string;
  type: 'fill-blank' | 'rearrange' | 'missing-char' | 'custom'; // Added 'custom' type
  options?: string[]; // For rearrange or multiple choice
  answer: string;
  explanation: string;
}

export interface DebugInfo {
  latency: number;
  rawResponse: string;
  parsedResponse?: any;
  error?: string;
  timestamp: string;
}

export interface AiResponse {
  quiz: QuizQuestion;
  debug: DebugInfo;
}

export interface LeaderboardEntry {
  name: string;
  className: string;
  score: number;
  date: string;
  difficulty: Difficulty;
}

// MediaPipe Type Definitions (Augmenting window)
declare global {
  interface Window {
    Hands: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
  }
}