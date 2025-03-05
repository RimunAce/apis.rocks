import { TokenizationService } from "./tokenization.service";

const tokenService = TokenizationService.getInstance();

// Test basic token counting
const text = "This is a test string to count tokens.";
const model = "gpt-4o";
const tokens = tokenService.countTokens(text, model);
console.log(`Token count for "${text}": ${tokens}`);

// Test token counting for chat messages
const messages = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello, can you help me with token counting?" },
  {
    role: "assistant",
    content:
      "Yes, I'd be happy to help with token counting! What would you like to know?",
  },
];

const chatTokens = tokenService.countTokensInMessages(messages, model);
console.log(`Token count for chat messages: ${chatTokens}`);

// Test streaming token counter
const streamCounter = tokenService.createStreamingTokenCounter(model);
const chunks = [
  "This is ",
  "the first chunk. ",
  "This is the second chunk.",
  " And this is the final part.",
];

// Simulate receiving chunks over time
chunks.forEach((chunk) => {
  streamCounter.addChunk(chunk);
  console.log(
    `After adding chunk "${chunk}": ${streamCounter.getTokenCount()} tokens`
  );
});

// Test SSE chunk parsing
const sseChunk =
  'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1716668936,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello world"},"finish_reason":null}]}';
const content = tokenService.parseSSEChunk(sseChunk);
console.log(`Extracted content from SSE chunk: "${content}"`);

console.log("All tests completed!");
