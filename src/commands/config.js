import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import chalk from 'chalk';
import config from '../core/config.js';

function createRl() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question, defaultVal) {
  const suffix = defaultVal ? ` ${chalk.dim(`[${defaultVal}]`)}` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

function askChoice(rl, question, choices, defaultVal) {
  const choiceStr = choices
    .map((c) => (c === defaultVal ? chalk.bold.underline(c) : c))
    .join(' / ');
  return ask(rl, `${question} (${choiceStr})`, defaultVal);
}

function detectKeepassCli() {
  try {
    execFileSync('keepassxc-cli', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function detectKeytar() {
  try {
    await import('keytar');
    return true;
  } catch {
    return false;
  }
}

export default async function configCommand(opts) {
  if (opts.secrets) {
    const valid = ['keepass', 'keytar', 'env'];
    if (!valid.includes(opts.secrets)) {
      console.error(chalk.red(`Invalid secrets backend: ${opts.secrets}. Choose: ${valid.join(', ')}`));
      process.exit(1);
    }
    config.set('secretsBackend', opts.secrets);
    console.log(chalk.green(`Secrets backend set to: ${opts.secrets}`));
    return;
  }

  const rl = createRl();

  try {
    console.log(chalk.bold('\nadoboards - Configuration Wizard\n'));

    // 1. ADO org URL
    const orgUrl = await ask(rl, 'Azure DevOps org URL (e.g. https://dev.azure.com/myorg)', config.get('orgUrl'));
    config.set('orgUrl', orgUrl);

    // 2. Project name
    const project = await ask(rl, 'Project name', config.get('project'));
    config.set('project', project);

    // 3. Default area path
    const defaultArea = await ask(rl, 'Default area path (e.g. TeamName/SubArea)', config.get('defaultArea'));
    if (defaultArea) config.set('defaultArea', defaultArea);

    // 4. Secrets backend
    console.log(chalk.bold('\nSecrets Backend'));
    const hasKeepass = detectKeepassCli();
    if (hasKeepass) {
      console.log(chalk.green('  keepassxc-cli detected on PATH'));
    } else {
      console.log(chalk.yellow('  keepassxc-cli not found on PATH'));
    }

    const currentBackend = config.get('secretsBackend') || (hasKeepass ? 'keepass' : 'env');
    const secretsBackend = await askChoice(rl, 'Secrets backend', ['keepass', 'keytar', 'env'], currentBackend);
    config.set('secretsBackend', secretsBackend);

    // 5. KeePass path
    if (secretsBackend === 'keepass') {
      const keepassDbPath = await ask(rl, 'Path to .kdbx file', config.get('keepassDbPath'));
      if (keepassDbPath) {
        if (!existsSync(keepassDbPath)) {
          console.log(chalk.yellow(`  Warning: ${keepassDbPath} does not exist yet`));
        }
        config.set('keepassDbPath', keepassDbPath);
      }

      console.log(chalk.bold('\n  KeePass Setup - you need to create entries manually:\n'));
      console.log(chalk.dim('  1. Open your .kdbx file in KeePassXC'));
      console.log(chalk.dim('  2. Right-click the root group -> New Group -> name it "adoboards"'));
      console.log(chalk.dim('  3. Inside that group, create these entries:\n'));
      console.log(chalk.dim('     Entry title        Password field contains'));
      console.log(chalk.dim('     ─────────────────  ─────────────────────────────────────'));
      console.log(chalk.dim('     ado-pat            Azure DevOps Personal Access Token'));
      console.log(chalk.dim('     anthropic-key      Anthropic Claude API key'));
      console.log(chalk.dim('     openai-key         OpenAI ChatGPT API key'));
      console.log(chalk.dim('     gemini-key         Google Gemini API key'));
      console.log(chalk.dim('\n     Only ado-pat is required. AI keys are optional for gen/optimize/plan.\n'));
      console.log(chalk.bold('  How to get your Azure DevOps PAT (even with corporate SSO):\n'));
      console.log(chalk.dim('  1. Sign in to Azure DevOps in your browser (SSO handles auth)'));
      console.log(chalk.dim('  2. Click your profile icon (top right) -> "Personal access tokens"'));
      console.log(chalk.dim('     Or go to: ') + chalk.cyan.underline(`${orgUrl}/_usersSettings/tokens`));
      console.log(chalk.dim('  3. Click "New Token"'));
      console.log(chalk.dim('     • Name: adoboards'));
      console.log(chalk.dim('     • Expiration: max your org allows (usually 1 year)'));
      console.log(chalk.dim('     • Scopes: Custom defined -> Work Items -> Read & Write'));
      console.log(chalk.dim('  4. Click "Create" - copy the token immediately (shown only once)'));
      console.log(chalk.dim('  5. In KeePassXC: paste it as the Password of the ado-pat entry\n'));
    }

    if (secretsBackend === 'env') {
      console.log(chalk.yellow('\n  ⚠ Not recommended for daily use - env vars sit in plain text.'));
      console.log(chalk.yellow('    Use only for CI/CD, Docker, or headless servers.'));
      console.log(chalk.yellow('    For daily use: adoboards config --secrets keepass\n'));
      console.log(chalk.dim('  Set these environment variables:\n'));
      console.log(chalk.dim('    ADOBOARDS_ADO_PAT              - Azure DevOps PAT (required)'));
      console.log(chalk.dim('    ADOBOARDS_ANTHROPIC_KEY         - if using Claude'));
      console.log(chalk.dim('    ADOBOARDS_OPENAI_KEY            - if using ChatGPT'));
      console.log(chalk.dim('    ADOBOARDS_GEMINI_KEY            - if using Gemini\n'));
      console.log(chalk.dim('  Or copy the template:  cp .env.example .env'));
      console.log(chalk.dim('  NEVER commit .env - it is in .gitignore but double-check.\n'));
    }

    // 6. AI provider (optional)
    console.log(chalk.bold('\nAI Provider (optional)'));
    console.log(chalk.dim('  Skip if you don\'t have API access - CLI works fully without AI.'));
    console.log(chalk.dim('  AI is only needed for: gen, optimize, plan commands.\n'));
    const aiProvider = await askChoice(
      rl,
      'AI provider',
      ['none', 'anthropic', 'openai', 'gemini', 'azure-openai'],
      config.get('aiProvider') || 'none',
    );
    if (aiProvider === 'none') {
      config.delete('aiProvider');
      console.log(chalk.dim('  AI features disabled - you can enable later with: adoboards config'));
    } else {
      config.set('aiProvider', aiProvider);

      if (aiProvider === 'azure-openai') {
        // Azure OpenAI specific config
        const endpoint = await ask(rl, 'Azure OpenAI endpoint (e.g. https://your-resource.openai.azure.com)', config.get('azureOpenaiEndpoint'));
        if (endpoint) config.set('azureOpenaiEndpoint', endpoint);

        const deployment = await ask(rl, 'Deployment name (model you deployed)', config.get('azureOpenaiDeployment') || 'gpt-4o');
        if (deployment) config.set('azureOpenaiDeployment', deployment);

        console.log(chalk.bold('\n  Azure OpenAI Setup:\n'));
        console.log(chalk.dim('  1. Go to Azure Portal -> your OpenAI resource -> Keys and Endpoint'));
        console.log(chalk.dim('  2. Copy Key 1 (or Key 2)'));
        if (secretsBackend === 'keepass') {
          console.log(chalk.dim('  3. In KeePassXC: create entry adoboards/azure-openai-key'));
          console.log(chalk.dim('     Paste the key as the Password field'));
        } else if (secretsBackend === 'env') {
          console.log(chalk.dim('  3. Set: export ADOBOARDS_AZURE_OPENAI_KEY="your-key"'));
        }
        console.log();
      } else {
        const keyNames = { anthropic: 'anthropic-key', openai: 'openai-key', gemini: 'gemini-key' };
        const keyUrls = {
          anthropic: 'https://console.anthropic.com/settings/keys',
          openai: 'https://platform.openai.com/api-keys',
          gemini: 'https://aistudio.google.com/apikey',
        };
        if (secretsBackend === 'keepass') {
          console.log(chalk.dim(`  Ensure adoboards/${keyNames[aiProvider]} exists in your KeePass database`));
          console.log(chalk.dim('  Get your API key here: ') + chalk.cyan.underline(keyUrls[aiProvider]));
        }
      }
    }

    // 7. AI persona (optional - helps AI write in your domain language)
    console.log(chalk.bold('\nAI Persona (optional)'));
    console.log(chalk.dim('  Tells the AI who you are so it writes in the right tone and domain language.'));
    console.log(chalk.dim('  Example role: "Senior Solution Architect"'));
    console.log(chalk.dim('  Example context: "Infrastructure and cloud platform team, Azure/AWS/on-prem"\n'));

    const userRole = await ask(rl, 'Your role/title', config.get('userRole') || '');
    if (userRole) config.set('userRole', userRole);

    const userContext = await ask(rl, 'What your team does (short description)', config.get('userContext') || '');
    if (userContext) config.set('userContext', userContext);

    // 8. Team capacity (optional - only for plan command)
    console.log(chalk.bold('\nTeam Capacity (optional)'));
    console.log(chalk.dim('  Used by the "plan" command to distribute stories across sprints.'));
    console.log(chalk.dim('  It calculates how many story points fit per sprint based on your team.'));
    console.log(chalk.dim('  Skip if you don\'t use sprint planning or prefer to assign manually.\n'));
    const teamSize = await ask(rl, 'Team size (number of people)', String(config.get('teamSize') || ''));
    if (teamSize) config.set('teamSize', Number(teamSize));

    const velocity = await ask(rl, 'Velocity per person per sprint (story points)', String(config.get('velocityPerPerson') || ''));
    if (velocity) config.set('velocityPerPerson', Number(velocity));

    const sprintDays = await ask(rl, 'Sprint length (days)', String(config.get('sprintLengthDays') || '14'));
    if (sprintDays) config.set('sprintLengthDays', Number(sprintDays));

    // 9. Reports directory (optional)
    console.log(chalk.bold('\nReports Directory (optional)'));
    console.log(chalk.dim('  Where sprint reports are saved when you run "adoboards report".'));
    console.log(chalk.dim('  Can be absolute (e.g. ~/Documents/reports) or relative to project root.'));
    console.log(chalk.dim('  Default: ./reports in your project root.\n'));
    const reportsDir = await ask(rl, 'Reports output directory', config.get('reportsDir') || 'reports');
    if (reportsDir) config.set('reportsDir', reportsDir);

    // Summary
    console.log(chalk.bold('\nConfiguration saved:'));
    console.log(`  Org:       ${chalk.cyan(config.get('orgUrl'))}`);
    console.log(`  Project:   ${chalk.cyan(config.get('project'))}`);
    if (config.get('defaultArea')) console.log(`  Area:      ${chalk.cyan(config.get('defaultArea'))}`);
    console.log(`  Secrets:   ${chalk.cyan(config.get('secretsBackend'))}`);
    if (config.get('keepassDbPath')) console.log(`  KeePass:   ${chalk.cyan(config.get('keepassDbPath'))}`);
    console.log(`  AI:        ${chalk.cyan(config.get('aiProvider') || 'none')}`);
    if (config.get('teamSize')) {
      console.log(`  Team:      ${chalk.cyan(config.get('teamSize'))} people, ${chalk.cyan(config.get('velocityPerPerson'))} pts/person, ${chalk.cyan(config.get('sprintLengthDays'))}-day sprints`);
    }
    if (config.get('reportsDir')) console.log(`  Reports:   ${chalk.cyan(config.get('reportsDir'))}`);
    console.log(chalk.dim(`\n  Config stored at: ${config.path}\n`));
  } finally {
    rl.close();
  }
}
