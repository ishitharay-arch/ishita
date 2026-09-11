/**
 * Simple test to verify Claude connection
 * Run with: node test-claude.mjs
 */

import dotenv from 'dotenv';
dotenv.config();

console.log('=== Claude Connection Test ===\n');

// Check if API key is set
if (!process.env.ANTHROPIC_API_KEY) {
  console.log('❌ ANTHROPIC_API_KEY is not set in environment variables');
  console.log('\nPlease add it to your .env.local file:');
  console.log('  ANTHROPIC_API_KEY=your_actual_api_key_here');
  process.exit(1);
}

console.log('✅ ANTHROPIC_API_KEY is set');
console.log('API Key (first 10 chars):', process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...');

// Test API call
async function testClaudeConnection() {
  try {
    console.log('\nTesting Claude API connection...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: 'Say "Connection successful!" in exactly those words.'
        }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.log('\n❌ Claude API Error:', response.status);
      console.log('Error details:', error);
      return false;
    }

    const data = await response.json();
    console.log('\n✅ Claude API Connection Successful!');
    console.log('Claude response:', data.content[0].text);
    return true;
    
  } catch (error) {
    console.log('\n❌ Connection Error:', error.message);
    return false;
  }
}

testClaudeConnection().then(success => {
  if (success) {
    console.log('\n=== 🎉 Claude Integration is Working! ===');
  } else {
    console.log('\n=== ⚠️ Claude Integration Needs Configuration ===');
  }
});