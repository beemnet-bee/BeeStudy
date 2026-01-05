
import { GoogleGenAI, Type } from "@google/genai";
import { StudyMaterial, StudyConfig, Slide } from "../types";

export const analyzeMaterial = async (
  text: string,
  media: { data: string, mimeType: string, name: string }[],
  config: StudyConfig,
  existingMaterial?: StudyMaterial
): Promise<StudyMaterial> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const prompt = `
    Analyze the provided study material and act as a world-class instructional designer.
    ${existingMaterial ? `EXISTING CONTEXT: You are updating an existing study session titled "${existingMaterial.title}". Merge the new information into the current structure.` : ''}
    
    User Preferences:
    - Goal: ${config.goal}
    - Difficulty: ${config.difficulty}

    CRITICAL FORMATTING RULES FOR FORMULAS:
    - EVERY formula MUST be wrapped in LaTeX delimiters.
    - Use $$...$$ for standalone formulas, $...$ for inline.

    Your output MUST be a JSON object containing:
    1. title: Professional title.
    2. summary: 3-5 sentence overview.
    3. notes: 10-15 detailed bullet points.
    4. formulas: Array of all formulas found.
    5. flashcards: 10-12 active recall cards.
    6. quiz: 8 questions.
    7. curriculum: 6-8 objects.
       - title: Engaging lesson title.
       - content: A comprehensive educational passage (300-500 words). Do not use short sentences. Use detailed, explanatory paragraphs.
       - keyTakeaway: One-sentence synthesis.
       - vocabulary: 3-5 key technical terms and their definitions.
       - objectives: 2-3 specific learning outcomes for this lesson.

    Source Material: ${text}
  `;

  const parts: any[] = [{ text: prompt }];
  media.slice(0, 10).forEach(m => {
    parts.push({
      inlineData: {
        data: m.data,
        mimeType: m.mimeType
      }
    });
  });

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          notes: { type: Type.ARRAY, items: { type: Type.STRING } },
          formulas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                formula: { type: Type.STRING },
                parameters: { type: Type.STRING }
              },
              required: ["name", "formula", "parameters"]
            }
          },
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { front: { type: Type.STRING }, back: { type: Type.STRING } },
              required: ["front", "back"]
            }
          },
          quiz: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.INTEGER },
                explanation: { type: Type.STRING }
              },
              required: ["question", "options", "correctAnswer", "explanation"]
            }
          },
          curriculum: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
                keyTakeaway: { type: Type.STRING },
                vocabulary: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      term: { type: Type.STRING },
                      definition: { type: Type.STRING }
                    },
                    required: ["term", "definition"]
                  }
                },
                objectives: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "content", "keyTakeaway", "vocabulary", "objectives"]
            }
          }
        },
        required: ["title", "summary", "notes", "formulas", "flashcards", "quiz", "curriculum"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text || "{}");
    data.sources = media.map(m => m.name);
    return data;
  } catch (error) {
    console.error("JSON Parse Error:", error);
    throw new Error("Failed to structure the study Hive.");
  }
};

export const generateSlideOutline = async (
  topics: string[],
  context: string
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const prompt = `
    Create a logical 10-12 slide presentation outline.
    Topics: ${topics.join(', ')}
    Context: ${context}
    
    Return ONLY a JSON array of strings (the titles).
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  return JSON.parse(response.text || "[]");
};

export const generateSingleSlide = async (
  title: string,
  fullOutline: string[],
  context: string,
  extraPrompt: string = ""
): Promise<Slide> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const prompt = `
    Create content for a slide titled: "${title}".
    Context: ${context}
    ${extraPrompt ? `Additional Instructions: ${extraPrompt}` : ''}

    RULES:
    1. MAX 4 highly impactful bullet points. 
    2. Bullets must be brief (max 20 words each).
    3. Use LaTeX for technical terms.
    4. visualPrompt: A vivid description of a professional visual for this slide.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
          visualPrompt: { type: Type.STRING }
        },
        required: ["title", "bullets", "visualPrompt"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const chatWithTutor = async (
  history: { role: 'user' | 'model'; text: string }[],
  context: string,
  userMessage: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: userMessage }] }
    ],
    config: {
        systemInstruction: `You are Buzz, an encouraging and brilliant tutor. Context: ${context}.
        RULES:
        1. Keep responses helpful and concise.
        2. Use LaTeX for ALL math/formulas. Wrap in $$ for blocks and $ for inline.`
    }
  });
  return response.text || "Buzz got distracted! Try again.";
};
