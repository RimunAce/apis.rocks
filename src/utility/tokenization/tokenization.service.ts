import { encoding_for_model, get_encoding } from "tiktoken";
import { loggerService } from "../logger/logger.service";

interface Message {
  role: string;
  content: string;
}

export class TokenizationService {
  private static instance: TokenizationService;

  private constructor() {}

  public static getInstance(): TokenizationService {
    if (!TokenizationService.instance) {
      TokenizationService.instance = new TokenizationService();
    }
    return TokenizationService.instance;
  }

  public countTokens(text: string, model: string): number {
    try {
      const enc = this.getEncodingForModel(model);
      const tokens = enc.encode(text);
      return tokens.length;
    } catch (error) {
      loggerService.warn(`Error counting tokens for model ${model}`, { error });
      return Math.ceil(text.length / 4);
    }
  }

  public countTokensInMessages(messages: Message[], model: string): number {
    try {
      if (model.includes("gpt-")) {
        return this.countChatTokensOpenAI(messages, model);
      }

      return messages.reduce((total, message) => {
        return total + this.countTokens(message.content, model);
      }, 0);
    } catch (error) {
      loggerService.warn(`Error counting message tokens for model ${model}`, {
        error,
      });

      return messages.reduce((total, message) => {
        return total + Math.ceil(message.content.length / 4);
      }, 0);
    }
  }

  public createStreamingTokenCounter(model: string): {
    addChunk: (chunk: string) => void;
    getTokenCount: () => number;
  } {
    let accumulatedText = "";

    return {
      addChunk: (chunk: string) => {
        accumulatedText += chunk;
      },
      getTokenCount: () => {
        return this.countTokens(accumulatedText, model);
      },
    };
  }

  public parseSSEChunk(chunk: string): string {
    try {
      const match = chunk.match(/data: ({.*})/);
      if (match && match[1]) {
        const data = JSON.parse(match[1]);
        return data.choices?.[0]?.delta?.content || "";
      }
    } catch (error) {
      // Shhh...
    }

    return "";
  }

  private countChatTokensOpenAI(messages: Message[], model: string): number {
    const tokensPerMessage = 3;
    const tokensPerName = 1;

    let totalTokens = 0;

    for (const message of messages) {
      totalTokens += tokensPerMessage;

      totalTokens += this.countTokens(message.content, model);

      totalTokens += this.countTokens(message.role, model);
    }

    totalTokens += 3;

    return totalTokens;
  }

  private getEncodingForModel(model: string) {
    try {
      return encoding_for_model(model as any);
    } catch (error) {
      try {
        return get_encoding("cl100k_base");
      } catch (fallbackError) {
        loggerService.error("Failed to get encoding for model", {
          model,
          error,
          fallbackError,
        });
        return get_encoding("gpt2");
      }
    }
  }
}
