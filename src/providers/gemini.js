import axios from 'axios';
import * as secrets from '../core/secrets.js';

export async function complete(prompt, opts = {}) {
  const key = await secrets.get('gemini-key');
  const model = opts.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: opts.maxTokens || 4096 },
  }, {
    headers: { 'Content-Type': 'application/json' },
    params: { key },
  });
  return res.data.candidates[0].content.parts[0].text;
}
