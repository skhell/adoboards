import axios from 'axios';
import { execFileSync } from 'node:child_process';
import * as secrets from '../core/secrets.js';

async function getGitHubToken() {
  // Try gh CLI first for github-copilot - avoids unnecessary KeePass prompts
  // when the user is already authenticated via gh auth login
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (token) return token;
  } catch {
    // gh not available or not logged in - fall through to secrets store
  }

  try {
    return await secrets.get('github-copilot-key');
  } catch {
    throw new Error(
      'GitHub token not found. Either:\n' +
      '  1. Authenticate via the gh CLI: gh auth login\n' +
      '  2. Store a GitHub PAT as "github-copilot-key" in your secrets',
    );
  }
}

export async function complete(prompt, opts = {}) {
  const token = await getGitHubToken();
  const res = await axios.post('https://models.inference.ai.azure.com/chat/completions', {
    model: opts.model || 'gpt-4o',
    max_tokens: opts.maxTokens || 4096,
    messages: [{ role: 'user', content: prompt }],
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return res.data.choices[0].message.content;
}
