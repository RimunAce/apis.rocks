# Token Counting for AI

This module counts tokens for AI models using OpenAI's `tiktoken` library.
For the realest real.

## What It Does

- Counts tokens accurately for both regular and streaming responses
- Uses the right tokenizer for each AI model
- Falls back to estimates if the main method fails

## How It Works

For regular responses:

- Count input tokens precisely
- Count output tokens from the response

For streaming responses:

- Reserve credits upfront with an estimate
- Count actual tokens as they arrive
- Update the final count when complete
