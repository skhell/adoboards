import axios from 'axios';
import * as secrets from '../core/secrets.js';

export async function complete(prompt, opts = {}) {
  const key = await secrets.get('anthropic-key');
  const res = await axios.post('https://api.anthropic.com/v1/messages', {
    model: opts.model || 'claude-sonnet-4-20250514',
    max_tokens: opts.maxTokens || 4096,
    messages: [{ role: 'user', content: prompt }],
  }, {
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
  });
  return res.data.content[0].text;
}
