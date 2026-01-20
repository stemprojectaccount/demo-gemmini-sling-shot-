/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI } from "@google/genai";
import { AiResponse, DebugInfo, QuizQuestion, Difficulty } from "../types";

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;

if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
} else {
    console.error("API_KEY is missing from environment variables.");
}

const MODEL_NAME = "gemini-3-flash-preview";

export const generateQuizQuestion = async (
  topic: string,
  userLevel: string, // e.g. "Class 7-A"
  difficulty: Difficulty
): Promise<AiResponse> => {
  const startTime = performance.now();
  
  const debug: DebugInfo = {
    latency: 0,
    rawResponse: "",
    timestamp: new Date().toLocaleTimeString()
  };

  // Fallback question if API fails
  const fallbackQuestion: QuizQuestion = {
    question: "The API could not be reached. Spell 'Apple'.",
    type: "missing-char",
    answer: "Apple",
    explanation: "Network error occurred."
  };

  if (!ai) {
    return {
        quiz: fallbackQuestion,
        debug: { ...debug, error: "API Key Missing" }
    };
  }

  let difficultyPrompt = "";
  switch (difficulty) {
    case 'Easy':
        difficultyPrompt = "Keep the vocabulary very basic and sentences short. Focus on simple present tense.";
        break;
    case 'Medium':
        difficultyPrompt = "Use standard grade-level vocabulary and grammar.";
        break;
    case 'Hard':
    case 'Infinity':
        difficultyPrompt = "Include advanced vocabulary, idioms, or complex sentence structures.";
        break;
  }

  const prompt = `
    You are an English teacher for a student in ${userLevel}.
    The student wants to learn about: "${topic}".
    Difficulty Level: ${difficulty}. ${difficultyPrompt}
    
    Generate ONE short, single English exercise question.
    Choose randomly between these 3 types:
    1. 'fill-blank': A sentence with one missing word (represented by ____).
    2. 'rearrange': A scrambled sentence to put in order.
    3. 'missing-char': A vocabulary word related to the topic with 1-2 missing letters (e.g., "C_mputer").

    RETURN JSON ONLY.
    {
      "question": "The question text",
      "type": "fill-blank" | "rearrange" | "missing-char",
      "answer": "The correct answer string",
      "explanation": "Short explanation in Vietnamese (Tiếng Việt) about why this is correct."
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.7
      }
    });

    const endTime = performance.now();
    debug.latency = Math.round(endTime - startTime);
    
    let text = response.text || "{}";
    debug.rawResponse = text;
    
    try {
        const json = JSON.parse(text);
        
        // Basic validation
        if (json.question && json.answer) {
             return {
                quiz: {
                    question: json.question,
                    type: json.type || 'fill-blank',
                    answer: json.answer,
                    explanation: json.explanation || "Correct!"
                },
                debug
            };
        }
        throw new Error("Invalid JSON structure");

    } catch (e: any) {
        console.warn("Failed to parse Gemini JSON:", text);
        return {
            quiz: fallbackQuestion,
            debug: { ...debug, error: `JSON Parse Error: ${e.message}` }
        };
    }
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const endTime = performance.now();
    debug.latency = Math.round(endTime - startTime);
    return {
        quiz: fallbackQuestion,
        debug: { ...debug, error: error.message || "Unknown API Error" }
    };
  }
};