import axios from 'axios';
import * as secrets from '../core/secrets.js';
import config from '../core/config.js';

export async function complete(prompt, opts = {}) {
  const key = await secrets.get('azure-openai-key');
  const endpoint = config.get('azureOpenaiEndpoint');
  const deployment = opts.model || config.get('azureOpenaiDeployment') || 'gpt-4o';
  const apiVersion = config.get('azureOpenaiApiVersion') || '2024-08-01-preview';

  if (!endpoint) {
    throw new Error(
      'Azure OpenAI endpoint not configured.\n' +
      '  Run: adoboards config\n' +
      '  Or set manually: adoboards config --azure-endpoint https://your-resource.openai.azure.com',
    );
  }

  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const res = await axios.post(url, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: opts.maxTokens || 4096,
  }, {
    headers: {
      'api-key': key,
      'Content-Type': 'application/json',
    },
  });

  return res.data.choices[0].message.content;
}
