import axios from 'axios';
import * as secrets from '../core/secrets.js';

export async function complete(prompt, opts = {}) {
  const key = await secrets.get('openai-key');
  const res = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: opts.model || 'gpt-4o',
    max_tokens: opts.maxTokens || 4096,
    messages: [{ role: 'user', content: prompt }],
  }, {
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  return res.data.choices[0].message.content;
}
