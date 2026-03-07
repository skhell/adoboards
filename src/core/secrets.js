import { spawn, execFileSync } from 'node:child_process';
import config from './config.js';

const ENV_MAP = {
  'ado-pat': 'ADOBOARDS_ADO_PAT',
  'anthropic-key': 'ADOBOARDS_ANTHROPIC_KEY',
  'openai-key': 'ADOBOARDS_OPENAI_KEY',
  'gemini-key': 'ADOBOARDS_GEMINI_KEY',
};

// Cache the master password for the duration of the process
// so the user only types it once per session, not once per secret
let cachedMasterPassword = null;

function isDatabaseUnlocked(dbPath) {
  // If KeePassXC desktop is open and unlocked, keepassxc-cli can read without a password.
  // Test by trying to list the root - if it works, no password needed.
  try {
    execFileSync('keepassxc-cli', ['ls', '-q', dbPath], {
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      input: '',
    });
    return true;
  } catch {
    return false;
  }
}

async function askMasterPassword(dbPath) {
  if (cachedMasterPassword) return cachedMasterPassword;

  // Check if database is already unlocked via KeePassXC desktop
  if (isDatabaseUnlocked(dbPath)) {
    cachedMasterPassword = '';
    return '';
  }

  const password = await new Promise((resolve) => {
    process.stderr.write(`\n  KeePass master password for ${dbPath}: `);

    if (!process.stdin.isTTY) {
      // Non-interactive - read a line from stdin
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', () => resolve(data.split('\n')[0]));
      process.stdin.resume();
      return;
    }

    // Interactive - raw mode, no echo, show * for each character
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    let input = '';
    const onData = (char) => {
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stderr.write('\n');
        resolve(input);
      } else if (char === '\u0003') {
        process.stdin.setRawMode(false);
        process.stderr.write('\n');
        process.exit(1);
      } else if (char === '\u007f' || char === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stderr.write('\b \b');
        }
      } else {
        input += char;
        process.stderr.write('*');
      }
    };
    process.stdin.on('data', onData);
  });

  cachedMasterPassword = password;
  return password;
}

function runKeepassCli(args, password) {
  return new Promise((resolve, reject) => {
    const proc = spawn('keepassxc-cli', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    // Send master password on stdin if we have one
    if (password) {
      proc.stdin.write(password + '\n');
    }
    proc.stdin.end();

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        const err = new Error(`keepassxc-cli exited with code ${code}`);
        err.stderr = stderr;
        reject(err);
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function fromKeepass(entryName) {
  const dbPath = config.get('keepassDbPath');
  if (!dbPath) {
    throw new Error('KeePass database path not configured. Run: adoboards config');
  }

  try {
    const masterPassword = await askMasterPassword(dbPath);
    const stdout = await runKeepassCli(
      ['show', '-a', 'Password', '-q', dbPath, `adoboards/${entryName}`],
      masterPassword,
    );
    const value = stdout.trim();
    if (!value) {
      throw new Error(`Entry adoboards/${entryName} exists but the Password field is empty`);
    }
    return value;
  } catch (err) {
    if (err.message?.includes('Password field is empty')) throw err;
    if (err.code === 'ENOENT') {
      throw new Error('keepassxc-cli not found on PATH. Install KeePassXC or switch backend: adoboards config --secrets env');
    }
    if (err.killed) {
      throw new Error('KeePass prompt timed out after 30s');
    }

    const reason = err.stderr?.trim();

    if (reason?.includes('Could not find entry')) {
      throw new Error(
        `Entry "adoboards/${entryName}" not found in ${dbPath}\n` +
        `  Make sure you have a group named "adoboards" with an entry titled "${entryName}" inside it.\n` +
        `  The entry Title must be exactly "${entryName}" (not the Password - that's where the actual key goes).`,
      );
    }
    if (reason?.includes('Error while reading the database') || reason?.includes('Invalid credentials')) {
      // Clear cached password so user can retry
      cachedMasterPassword = null;
      throw new Error(
        `Could not unlock ${dbPath} - wrong master password or database is corrupted.`,
      );
    }
    if (reason?.includes('not a KeePass database')) {
      throw new Error(`File is not a valid KeePass database: ${dbPath}`);
    }

    const detail = reason ? `\n  keepassxc-cli said: ${reason}` : '';
    throw new Error(`Failed to read adoboards/${entryName} from KeePass${detail}`);
  }
}

async function fromKeytar(entryName) {
  let keytar;
  try {
    keytar = await import('keytar');
  } catch {
    throw new Error('keytar module not available. Install it or switch backend: adoboards config --secrets env');
  }

  const value = await keytar.getPassword('adoboards', entryName);
  if (!value) {
    throw new Error(`No secret found in OS keychain for adoboards/${entryName}`);
  }
  return value;
}

function fromEnv(entryName) {
  const envVar = ENV_MAP[entryName];
  if (!envVar) {
    throw new Error(`Unknown secret entry: ${entryName}`);
  }
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`Environment variable ${envVar} is not set`);
  }
  return value;
}

export async function get(entryName) {
  const backend = config.get('secretsBackend') || 'keepass';

  switch (backend) {
    case 'keepass':
      return fromKeepass(entryName);
    case 'keytar':
      return fromKeytar(entryName);
    case 'env':
      return fromEnv(entryName);
    default:
      throw new Error(`Unknown secrets backend: ${backend}. Run: adoboards config`);
  }
}

export async function verify() {
  try {
    const pat = await get('ado-pat');
    if (pat.length < 10) {
      throw new Error('ADO PAT seems too short - check your entry');
    }
    return true;
  } catch (err) {
    throw new Error(`Secrets verification failed: ${err.message}`);
  }
}
