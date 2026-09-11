# Claude Integration Guide

This document describes the Claude integration that has been added to the voice bot evaluation platform.

## What Was Implemented

### 1. Model Gateway (`lib/models.ts`)
- **Anthropic API adapter**: Uses the official `@anthropic-ai/sdk`, defaults to `claude-sonnet-5`
- **OpenAI-compatible adapter**: Supports other providers (Ollama, Groq, OpenRouter, vLLM)
- **Four configurable roles**: generator, judge, optimizer, bot
- **Environment variable support**: Uses `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`
- **Structured outputs**: `callModelStructured()` takes a Zod schema and returns a guaranteed schema-conformant object via Claude's native structured outputs (no manual JSON parsing/markdown-fence stripping)

### 2. Configuration System (`lib/config.ts`)
- **Environment variable loading**: Loads API keys and model settings from `.env` files
- **Default configuration**: Sensible defaults for all roles using Claude Sonnet 5
- **Validation**: Checks for required environment variables

### 3. API Routes

#### `POST /api/generate`
- **Purpose**: Generate test cases using Claude
- **Input**: `{ botId }`
- **Process**: Loads bot's prompt, transcripts, and rules, then asks Claude to generate test cases
- **Output**: Generated test cases (unapproved, pending human review)

#### `POST /api/optimize`
- **Purpose**: Optimize prompts based on failing test cases
- **Input**: `{ runId }`
- **Process**: Analyzes failing test cases and proposes prompt improvements
- **Output**: Revised prompt (does not auto-save, requires explicit user action)

#### `POST /api/model-config`
- **Purpose**: Save/load model configuration
- **GET**: Returns current config and environment status
- **POST**: Saves configuration (placeholder for future persistence)

### 4. Enhanced Grading (`lib/gradeSoft.ts`)
- **Soft rule grading**: Uses Claude to score qualitative rules (empathy, clarity, etc.)
- **Diagnostic only**: Does not affect pass/fail gate
- **1-5 scoring**: Provides detailed feedback with reasons
- **Schema-validated**: Scores are returned via structured outputs (a Zod schema enforcing `ruleId`/`ruleName`/`score` 1-5/`reason`), so a malformed response can't silently produce bad scores

### 5. Mock Tool Layer (`lib/mockTools.ts`)
- **Tool call interception**: Prevents real API calls during testing
- **Fixture system**: Returns predefined responses for tools like `get_appointment`, `cancel_appointment`
- **Hallucination detection**: Identifies when bot invents identifiers not in tool responses

### 6. UI Components
- **Setup page** (`/setup`): Configure models for each role
- **Model Config sidebar link**: Added to navigation
- **Warning banner**: Shows when bot role uses Claude (optimistic results warning)

## How to Use

### 1. Set Up Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API key:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 2. Configure Models

1. Navigate to `/setup` in the application
2. Configure each role:
   - **Generator**: Model for generating test cases
   - **Judge**: Model for scoring soft rules
   - **Optimizer**: Model for proposing prompt improvements
   - **Bot**: Model to use as the bot under test
3. Choose between Anthropic (Claude) or OpenAI-compatible providers
4. For OpenAI-compatible, specify base URL and API key
5. Click "Save Configuration"

### 3. Generate Test Cases

1. Ensure your bot has:
   - A live prompt version
   - Transcripts uploaded
   - Rules defined
2. Use the test case generation feature (when implemented in UI)
3. Claude will generate 8-12 test cases covering:
   - Happy paths (~40%)
   - Edge cases from transcripts (~40%)
   - Adversarial scenarios (~20%)
4. Review and approve test cases before running

### 4. Run Grading with Soft Rules

1. Define soft rules in the rules section (kind: 'soft')
2. When grading transcripts, Claude will:
   - Score each soft rule 1-5
   - Provide one-line reasons
   - Store results separately from hard rule failures
3. Soft scores are diagnostic only and don't affect the pass/fail gate

### 5. Optimize Prompts

1. Run a test suite and get failures
2. Use the "Optimize prompt" feature (when implemented in UI)
3. Claude will analyze failures and propose improvements
4. Review the side-by-side diff
5. Save as a new prompt version (never auto-applied)

## Architecture Notes

### Model Roles

| Role | Purpose | Default Model |
|------|---------|---------------|
| `generator` | Writes test cases | claude-sonnet-5 |
| `judge` | Scores soft rules | claude-sonnet-5 |
| `optimizer` | Rewrites prompts | claude-sonnet-5 |
| `bot` | Bot under test | claude-sonnet-5 (temporary) |

### Warning Banner

When the bot role uses a Claude model, a warning banner appears:
> "Bot-under-test is running on Claude. Real bots run on a ~4B Gemma-class model which follows instructions less reliably. These results are optimistic."

This is because Claude is more capable than the actual production models.

### Tool Call Format

The platform uses a custom tool call format:
```
<tool>{"name":"get_appointment","args":{"phone":"98..."}}</tool>
```

This is different from the real Exotel/Gemma format and should be updated when integrating with the actual bot system.

## API Examples

### Generate Test Cases

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"botId": "your-bot-id"}'
```

### Optimize Prompt

```bash
curl -X POST http://localhost:3000/api/optimize \
  -H "Content-Type: application/json" \
  -d '{"runId": "your-run-id"}'
```

### Get Model Config

```bash
curl http://localhost:3000/api/model-config
```

## Troubleshooting

### Missing API Key Error
Ensure `ANTHROPIC_API_KEY` is set in your environment variables or `.env.local` file.

### Model Not Found
Verify the model name is correct for your provider. Claude models use the format `claude-sonnet-5`.

### Timeout Errors
The API routes have `maxDuration = 60` set. For complex operations, you may need to increase this or optimize prompts.

### Circular Dependency Issues
The soft rule grading is separated into `lib/gradeSoft.ts` to avoid circular dependencies between `grade.ts` and `models.ts`.

## Next Steps

1. **UI Integration**: Connect the generate/optimize buttons to the new API routes
2. **Persistence**: Implement database storage for model configuration
3. **Tool Format**: Update tool call format to match real Exotel/Gemma format
4. **Testing**: Add integration tests for the Claude API calls
5. **Monitoring**: Add logging and error tracking for API calls

## Files Created/Modified

### Created:
- `lib/models.ts` - Model gateway
- `lib/config.ts` - Configuration management
- `lib/mockTools.ts` - Mock tool layer
- `lib/gradeSoft.ts` - Soft rule grading
- `app/api/generate/route.ts` - Test case generation
- `app/api/optimize/route.ts` - Prompt optimization
- `app/api/model-config/route.ts` - Model configuration API
- `app/setup/page.tsx` - Model configuration UI
- `.env.example` - Environment variable template

### Modified:
- `lib/db.ts` - Added flow_rules table
- `lib/grade.ts` - Exported types, removed duplicate soft rule function
- `app/api/grade/route.ts` - Integrated soft rule grading
- `app/api/llm-context/route.ts` - Fixed duplicate comment
- `components/Sidebar.tsx` - Added Model Config link
- `app/page.tsx` - Added Model Config link to overview
- `next.config.mjs` - Added experimental server actions config