import Conf from 'conf';

const config = new Conf({
  projectName: 'adoboards',
  schema: {
    orgUrl: { type: 'string' },
    project: { type: 'string' },
    defaultArea: { type: 'string' },
    secretsBackend: { type: 'string', enum: ['keepass', 'keytar', 'env'], default: 'keepass' },
    keepassDbPath: { type: 'string' },
    aiProvider: { type: 'string', enum: ['anthropic', 'openai', 'gemini'], default: 'anthropic' },
    teamSize: { type: 'number' },
    velocityPerPerson: { type: 'number' },
    sprintLengthDays: { type: 'number' },
  },
});

export default config;
