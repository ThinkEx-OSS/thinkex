export interface QuizAnswerRecord {
  questionId: string;
  userAnswer: number;
  isCorrect: boolean;
  answeredAt: string;
}

export interface QuizProgressState {
  answers: QuizAnswerRecord[];
  attemptNumber: number;
  startedAt: string;
  completedAt?: string;
  score?: number;
  totalQuestions?: number;
}
