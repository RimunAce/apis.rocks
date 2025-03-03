export interface ChatCompletionsBody {
  stream?: boolean;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

export interface ChatCompletionsResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionsErrorResponse {
  error: string;
  message?: string;
  details?: any;
}
