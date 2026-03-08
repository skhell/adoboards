import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import config from '../core/config.js';

const PROMPTS_DIR = new URL('../prompts', import.meta.url).pathname;

/**
 * Load a prompt template and interpolate variables.
 * Templates use {{variable}} syntax.
 */
function loadPrompt(name, variables = {}) {
  const filePath = join(PROMPTS_DIR, `${name}.md`);
  let template = readFileSync(filePath, 'utf-8');

  for (const [key, value] of Object.entries(variables)) {
    template = template.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }

  return template;
}

/**
 * Generate AI content using the configured provider.
 * Throws if no AI provider is configured.
 */
export async function generate(promptName, variables = {}, opts = {}) {
  const providerName = opts.provider || config.get('aiProvider');
  if (!providerName) {
    throw new Error(
      'No AI provider configured.\n' +
      '  Run: adoboards config (and select an AI provider)\n' +
      '  Or use: --provider anthropic|openai|gemini',
    );
  }

  // Inject user persona into all prompts
  const role = config.get('userRole') || 'engineer';
  const context = config.get('userContext') || 'software development';
  const allVars = { role, context, ...variables };

  const { complete } = await import(`../providers/${providerName}.js`);
  const prompt = loadPrompt(promptName, allVars);
  return complete(prompt, opts);
}
