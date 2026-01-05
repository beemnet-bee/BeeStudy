
export enum ViewType {
  HOME = 'HOME',
  NOTES = 'NOTES',
  FLASHCARDS = 'FLASHCARDS',
  QUIZ = 'QUIZ',
  LEARN = 'LEARN',
  SLIDES = 'SLIDES',
}

export type StudyGoal = 'Exam Prep' | 'Concept Mastery' | 'Quick Summary';
export type Difficulty = 'High School' | 'University' | 'Expert';

export interface StudyConfig {
  goal: StudyGoal;
  difficulty: Difficulty;
  includeQuiz: boolean;
  includeCards: boolean;
}

export interface Flashcard {
  front: string;
  back: string;
  srsLevel?: number; // 0: Again, 1: Hard, 2: Good, 3: Easy
  lastReviewed?: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface VocabularyTerm {
  term: string;
  definition: string;
}

export interface CurriculumLesson {
  title: string;
  content: string; 
  keyTakeaway: string;
  vocabulary: VocabularyTerm[];
  objectives: string[];
}

export interface StudyFormula {
  name: string;
  formula: string; 
  parameters: string; 
}

export interface Slide {
  title: string;
  bullets: string[];
  visualPrompt?: string; 
}

export interface SlideDeck {
  id: string;
  title: string;
  timestamp: number;
  slides: Slide[];
}

export interface StudyMaterial {
  title: string;
  summary: string;
  notes: string[];
  formulas: StudyFormula[];
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  curriculum: CurriculumLesson[]; 
  sources?: string[]; 
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface StagedFile {
  id: string;
  file: File;
  preview?: string;
}
