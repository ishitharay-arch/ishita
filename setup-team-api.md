# Using Your Claude Team Plan with the Platform

## Step 1: Get Your API Key

1. Go to https://console.anthropic.com/
2. Sign in with your team account
3. Navigate to "API Keys" in the sidebar
4. Click "Create Key"
5. Name it (e.g., "voice-bot-eval")
6. Copy the key (starts with `sk-ant-`)

## Step 2: Add to Platform

Open `C:\Users\ishitha.ray\Documents\voice-bot-evaluation-platform\.env.local` and add:

```env
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
```

## Step 3: Test Connection

Run the test script:
```bash
node test-claude.mjs
```

## Step 4: Use the Platform

Now you can:
- Generate test cases automatically
- Grade transcripts with soft rules
- Optimize prompts based on failures

All using your team plan's tokens and billing.

## Monitoring Usage

Check your team console to monitor:
- Token usage
- Costs
- Rate limits

The platform logs all API calls, so you can track usage.
