# Build spec — Voice Bot Eval Platform

Paste this whole file into Windsurf as the task. Build it as a Next.js 14 App
Router project on Vercel with a Neon Postgres database.

---

## What this app does

A four-stage loop for testing voice bot prompts before they go live:

1. **Generate** — Claude reads the bot's system prompt + real call transcripts + our
   rules, and proposes test cases.
2. **Approve** — a human edits and approves test cases. Only approved cases run.
3. **Run** — each approved test case is played against the bot-under-test, producing
   a transcript. Tool calls are intercepted by a mock layer, never sent anywhere real.
4. **Grade + Optimize** — transcripts are checked against hard rules (pure code),
   then Claude proposes a revised prompt based on the failures.

Used across three departments: PPMC, Customer Support, In-clinic.

---

## Critical constraints — do not violate these

- **Never call a real tool endpoint.** All tool calls from the bot go to a mock
  fixture table. A real call would cancel a real patient appointment.
- **Hard rules are checked in code, not by an LLM.** Only soft rules use a judge.
- **Unapproved test cases never enter a run.**
- **No background job queue.** The browser loops through cases and calls
  `/api/run-case` once per case, so each request finishes well inside the Vercel
  timeout. Show a progress bar driven by the client loop.
- Set `maxDuration = 60` on run/generate routes.

---

## Data model (Neon Postgres)

```sql
bots(id uuid pk, name text, department text, created_at timestamptz)

prompt_versions(id uuid pk, bot_id uuid fk, version int, body text,
                is_live boolean default false, created_at timestamptz)

transcripts(id uuid pk, bot_id uuid fk, body text, created_at timestamptz)

rules(id uuid pk, bot_id uuid fk, kind text check (kind in ('hard','soft')),
      body text, active boolean default true)

test_cases(id uuid pk, bot_id uuid fk, spec jsonb,
           approved_by text, approved_at timestamptz, created_at timestamptz)

runs(id uuid pk, bot_id uuid fk, prompt_version_id uuid fk, status text,
     bot_model text, judge_model text, started_at timestamptz, finished_at timestamptz)

results(id uuid pk, run_id uuid fk, test_case_id uuid fk, passed boolean,
        failures jsonb, soft_scores jsonb, transcript jsonb, tools_called jsonb)
```

### test_cases.spec shape

```json
{
  "id": "ALIA-001",
  "scenario_type": "happy_path",
  "priority": "P0",
  "contact_uri": "09876543210",
  "fixture_variant": "default",
  "persona": "Calm 34-year-old, clear English, has the appointment ID ready.",
  "goal": "Cancel the lab test appointment on 27 August.",
  "caller_turns": [
    "hi I want to cancel my lab test",
    "APT double eight two one three",
    "yes please cancel it"
  ],
  "expected_tools": ["get_appointment", "cancel_appointment"],
  "must_say": ["cancel"],
  "must_not_say": ["successfully cancelled"],
  "expect_terminal_state": true
}
```

`caller_turns` is a fixed script — the caller is NOT simulated by a model in v1.
This keeps runs deterministic so v27 and v28 are comparable.

---

## Model gateway — `lib/models.ts`

One file. Four roles, each independently configurable from the UI:

| Role | Purpose | Default |
|---|---|---|
| `generator` | writes test cases | claude-sonnet-5 |
| `judge` | scores soft rules | claude-sonnet-5 |
| `optimizer` | rewrites the prompt | claude-sonnet-5 |
| `bot` | **the bot under test** | claude-sonnet-5 (temporary) |

```ts
export type Role = 'generator' | 'judge' | 'optimizer' | 'bot';

export async function callModel(
  role: Role,
  system: string,
  messages: {role: 'user'|'assistant', content: string}[],
  cfg: RunConfig
): Promise<string>
```

Providers: `anthropic` (api.anthropic.com/v1/messages) and `openai_compatible`
(any base URL + /chat/completions — covers Ollama, Groq, OpenRouter, vLLM).
Adding a provider must mean adding one adapter function, nothing else.

**Show a persistent amber banner whenever `bot` role is set to a Claude model:**
"Bot-under-test is running on Claude. Real bots run on a ~4B Gemma-class model
which follows instructions less reliably. These results are optimistic."

---

## Mock tool layer — `lib/mockTools.ts`

```ts
const FIXTURES = {
  get_appointment: {
    default:           {isSuccess:true, appointmentId:"APT-88213", status:"SCHEDULED",
                        date:"2026-08-27", slot:"10:30 AM", centre:"Indiranagar"},
    not_found:         {isSuccess:false, errorCode:"NOT_FOUND"},
    already_cancelled: {isSuccess:true, appointmentId:"APT-88213", status:"CANCELLED"},
  },
  cancel_appointment: {
    default:      {isSuccess:true, ticketId:"TKT-40021"},
    tool_failure: {isSuccess:false, errorCode:"UPSTREAM_TIMEOUT"},
  },
  reschedule_appointment: {
    default: {isSuccess:true, ticketId:"TKT-40022", newDate:"2026-08-30", newSlot:"4:00 PM"},
  },
};
```

`MockToolLayer` records every call as `{name, args, response}` and exposes
`names()` and `responseValues()` (all scalar values any tool returned — used to
detect the bot inventing identifiers).

Fixtures must be editable from the UI (a JSON textarea on the Setup page).

---

## Tool call parsing

Assume the bot emits: `<tool>{"name":"get_appointment","args":{"phone":"98..."}}</tool>`

Put the regex in ONE exported constant, `TOOL_CALL_PATTERN`, with a comment that
the real Exotel/Gemma format differs and this is the first thing to change.
Strip tool blocks out of the spoken text before storing the transcript.

---

## Pages

### `/setup`
- Bot selector (name + department: PPMC / Customer Support / In-clinic) with "New bot"
- Prompt textarea → saves a new `prompt_versions` row, auto-incrementing version
- Transcripts: multiple textareas or .txt upload → `transcripts` rows
- Rules: two lists, **Hard rules** and **Soft rules**, each with add/remove/toggle
- Mock fixtures JSON editor
- Model config: four dropdowns (generator / judge / optimizer / bot) + base URL
  and key fields for openai_compatible

### `/testcases`
- "Generate test cases" button → `/api/generate`
- Editable table of proposed cases: id, scenario_type, priority, persona, goal,
  caller_turns, expected_tools, must_say, must_not_say, fixture_variant
- Each row has an **Approve** checkbox. Bulk approve/reject.
- Clear visual separation between approved and pending cases
- Manual "Add case" button — hand-written cases are first-class

### `/run`
- Pick bot + prompt version, shows count of approved cases
- "Start run" → creates a `runs` row, then the CLIENT loops:
  `for each approved case: POST /api/run-case {runId, caseId}`
- Progress bar, live pass/fail list as results stream in
- Cancel button stops the loop

### `/results/[runId]`
- Header: X/Y passed, **P0 failures count**, and a large verdict:
  green "CLEAR TO PUSH" if zero P0 failures, red "BLOCKED" otherwise
- Table of results; click a row to expand the full transcript with
  CALLER / BOT / TOOL turns visually distinguished
- Failure reasons listed as chips per row
- Soft scores shown in a muted/secondary style labelled "Diagnostic only —
  does not affect the gate"
- "Optimize prompt" button → `/api/optimize`, result shown as a side-by-side
  diff against the current prompt, with **Save as new version** (never auto-apply)
- Compare-to-previous-run selector showing per-case regressions

---

## API routes

### `POST /api/generate`
Input: `botId`. Loads live prompt + transcripts + rules.
Prompt to the generator model: produce N test cases as a JSON array matching the
spec shape above. Require coverage across `scenario_type`:
~40% happy_path, ~40% edge cases drawn from the transcripts, ~20% adversarial
(silence, code-switching English/Hindi, caller interrupts, backend failure).
Always include at least one case with `contact_uri` empty (manual-fallback branch)
and one with it populated (auto-fetch branch).
Instruct: return ONLY the JSON array, no prose, no markdown fences. Strip fences
defensively before parsing. Insert rows with `approved_by = null`.

### `POST /api/run-case`
Input: `runId`, `testCaseId`. Runs ONE case:

```
ctx = promptBody.replaceAll("{contact_uri}", spec.contact_uri)
messages = [{role:'user', content:'[call connected]'}]
tools = new MockToolLayer(spec.fixture_variant)

for turnIndex in 0..spec.caller_turns.length:
    // bot may chain up to 4 tool calls before speaking
    repeat up to 4:
        out = callModel('bot', ctx, messages)
        parsed = TOOL_CALL_PATTERN.exec(out)
        if !parsed: break
        resp = tools.invoke(parsed.name, parsed.args)
        push transcript {speaker:'TOOL', text:`${name} -> ${json}`}
        messages.push assistant(out)
        messages.push user(`<tool_result>${json}</tool_result>`)
    spoken = stripToolBlocks(out)
    if spoken: transcript.push({speaker:'BOT', text:spoken}); messages.push assistant(spoken)
    if out contains '[end call]' or '[transfer call]':
        transcript.push({speaker:'SYSTEM', text:'[call ended by bot]'}); break
    if no caller_turns left: break
    next = spec.caller_turns[turnIndex]
    transcript.push({speaker:'CALLER', text:next}); messages.push user(next)
```

Then grade and insert a `results` row. Return it.

### `POST /api/optimize`
Input: `runId`. Sends the current prompt + every failing case with its transcript
and failure reasons to the optimizer model. Asks for a revised prompt that fixes
the failures without changing behaviour the passing cases depend on.
Returns the revised prompt as text — DOES NOT write it to `prompt_versions`.
Saving is an explicit user action.

---

## Grading — `lib/grade.ts`

### Hard rules (deterministic, no LLM). These decide pass/fail.

1. Every `must_say` phrase appears in the bot's speech (case-insensitive)
2. No `must_not_say` phrase appears
3. `toolsCalled.slice(0, expected.length)` deep-equals `expected_tools`
4. **Hallucinated identifiers**: any token matching `/\b(?:TKT|APT)-\w+\b/i` in the
   bot's speech that is not in `tools.responseValues()` is a failure
5. If `expect_terminal_state`, the transcript must contain `[call ended by bot]`

Return `{passed: failures.length === 0, failures: string[]}`.

### Soft rules (LLM judge). Diagnostic only, never gates a release.
Send the transcript + soft rules to the judge, get 1–5 scores with one-line
reasons per rule. Store in `results.soft_scores`.

### Release gate
`P0 failures === 0`. P1 failures are informational.

---

## Styling

Keep it plain and functional — default shadcn/ui components, no custom theming.
Brand styling is a later pass. Prioritise: dense readable tables, clear
pass/fail colour coding, transcripts that are easy to scan.

## Build order

1. Schema + Setup page (no models yet — just get data into the DB)
2. `/api/generate` + test case approval table
3. Mock tool layer + `/api/run-case` + Run page
4. Grading + Results page
5. `/api/optimize` + diff view
