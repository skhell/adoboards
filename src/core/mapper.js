import matter from 'gray-matter';
import { readFileSync } from 'node:fs';
import { FIELD_MAP, TYPE_HEADINGS } from '../api/ado.js';

const TSHIRT_MAP = { 1: 'XS', 3: 'S', 5: 'M', 8: 'L', 13: 'XL' };
const TSHIRT_REVERSE = { XS: 1, S: 3, M: 5, L: 8, XL: 13 };

// Normalize ADO date to YYYY-MM-DD regardless of format (ISO or M/D/YYYY h:mm AM/PM)
function parseAdoDate(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Normalize user-entered date to ISO 8601 for ADO API (accepts YYYY-MM-DD or M/D/YYYY)
export function toAdoDate(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

const TYPE_PREFIX = {
  Epic: 'EPIC',
  Feature: 'FEAT',
  'User Story': 'STORY',
  Bug: 'BUG',
  Task: 'TASK',
};

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export function adoToFrontmatter(workItem) {
  const f = workItem.fields;
  const type = f['System.WorkItemType'];
  const storyPoints = f['Microsoft.VSTS.Scheduling.StoryPoints'];

  const fm = {
    id: workItem.id,
    type: type === 'User Story' ? 'Story' : type,
    title: f['System.Title'],
    area: f['System.AreaPath'],
    state: f['System.State'],
  };

  if (f['System.IterationPath']) fm.iteration = f['System.IterationPath'];
  if (storyPoints != null) {
    fm.storyPoints = storyPoints;
    fm.tshirt = TSHIRT_MAP[storyPoints] || null;
  }
  if (f['Microsoft.VSTS.Common.BusinessValue'] != null) {
    fm.businessValue = f['Microsoft.VSTS.Common.BusinessValue'];
  }
  if (f['Microsoft.VSTS.Scheduling.Effort'] != null) {
    fm.effort = f['Microsoft.VSTS.Scheduling.Effort'];
  }
  if (f['Microsoft.VSTS.Common.Priority'] != null) {
    fm.priority = f['Microsoft.VSTS.Common.Priority'];
  }
  if (f['Microsoft.VSTS.Common.Risk']) {
    fm.risk = f['Microsoft.VSTS.Common.Risk'];
  }
  if (f['Microsoft.VSTS.Common.Complexity'] != null) {
    fm.complexity = f['Microsoft.VSTS.Common.Complexity'];
  }
  if (f['Microsoft.VSTS.Common.TimeCriticality'] != null) {
    fm.timeCriticality = f['Microsoft.VSTS.Common.TimeCriticality'];
  }
  if (f['Microsoft.VSTS.Scheduling.StartDate']) {
    fm.startDate = parseAdoDate(f['Microsoft.VSTS.Scheduling.StartDate']);
  }
  if (f['Microsoft.VSTS.Scheduling.TargetDate']) {
    fm.targetDate = parseAdoDate(f['Microsoft.VSTS.Scheduling.TargetDate']);
  }
  if (f['Microsoft.VSTS.Scheduling.FinishDate']) {
    fm.finishDate = parseAdoDate(f['Microsoft.VSTS.Scheduling.FinishDate']);
  }
  if (f['System.AssignedTo']?.uniqueName) {
    fm.assignee = f['System.AssignedTo'].uniqueName;
  }
  if (f['System.Tags']) {
    fm.tags = f['System.Tags'].split('; ').map((t) => t.trim()).filter(Boolean);
  }

  // Parent from relations
  if (workItem.relations) {
    const parentRel = workItem.relations.find(
      (r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse',
    );
    if (parentRel) {
      const parentId = Number(parentRel.url.split('/').pop());
      fm.parent = parentId;
    }
  }

  return fm;
}

export function adoToMarkdown(workItem) {
  const fm = adoToFrontmatter(workItem);
  const f = workItem.fields;
  const type = f['System.WorkItemType'];

  const sections = [];

  if (type === 'Bug') {
    const repro = htmlToSimpleMarkdown(f['Microsoft.VSTS.TCM.ReproSteps'] || '');
    sections.push(`## Repro Steps\n\n${repro || '_No repro steps_'}`);

    const sysInfo = htmlToSimpleMarkdown(f['Microsoft.VSTS.TCM.SystemInfo'] || '');
    if (sysInfo) {
      sections.push(`## System Info\n\n${sysInfo}`);
    }
  } else {
    const description = htmlToSimpleMarkdown(f['System.Description'] || '');
    sections.push(`## Description\n\n${description || '_No description_'}`);

    if (type === 'Feature' || type === 'User Story') {
      const acceptance = htmlToSimpleMarkdown(f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '');
      if (acceptance) {
        sections.push(`## Acceptance Criteria\n\n${acceptance}`);
      }
    }
  }

  const body = sections.join('\n\n');
  return matter.stringify('\n' + body + '\n', fm);
}

export function markdownToFields(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const { data, content: body } = matter(content);

  const fields = {};

  if (data.title) fields.title = data.title;
  if (data.state) fields.state = data.state;
  if (data.area) fields.area = data.area;
  if (data.iteration) fields.iteration = data.iteration;
  if (data.assignee) fields.assignee = data.assignee;
  if (data.storyPoints != null) fields.storyPoints = data.storyPoints;
  if (data.effort != null) fields.effort = data.effort;
  if (data.priority != null) fields.priority = data.priority;
  if (data.businessValue != null) fields.businessValue = data.businessValue;
  if (data.timeCriticality != null) fields.timeCriticality = data.timeCriticality;
  if (data.complexity != null) fields.complexity = data.complexity;
  if (data.risk) fields.risk = data.risk;
  if (data.startDate) fields.startDate = toAdoDate(data.startDate);
  if (data.targetDate) fields.targetDate = toAdoDate(data.targetDate);
  if (data.finishDate) fields.finishDate = toAdoDate(data.finishDate);
  if (data.tags?.length) fields.tags = data.tags.join('; ');

  // Parse body into separate ADO fields by ## headings
  const parsed = parseSections(body);
  if (parsed.description != null) fields.description = parsed.description;
  if (parsed.acceptanceCriteria != null) fields.acceptanceCriteria = parsed.acceptanceCriteria;
  if (parsed.reproSteps != null) fields.reproSteps = parsed.reproSteps;
  if (parsed.systemInfo != null) fields.systemInfo = parsed.systemInfo;

  return { id: data.id, type: data.type, fields, parent: data.parent };
}

function parseSections(body) {
  const result = {};
  const sections = body.split(/^## /m).filter(Boolean);

  for (const section of sections) {
    const newlineIdx = section.indexOf('\n');
    if (newlineIdx === -1) continue;

    const heading = section.slice(0, newlineIdx).trim().toLowerCase();
    const content = section.slice(newlineIdx + 1).trim();

    if (heading === 'description') {
      result.description = content === '_No description_' ? '' : content;
    } else if (heading === 'acceptance criteria') {
      result.acceptanceCriteria = content;
    } else if (heading === 'repro steps') {
      result.reproSteps = content === '_No repro steps_' ? '' : content;
    } else if (heading === 'system info') {
      result.systemInfo = content;
    }
  }

  return result;
}

export function workItemFileName(workItem) {
  const f = workItem.fields;
  const type = f['System.WorkItemType'];
  const prefix = TYPE_PREFIX[type] || type.toUpperCase();
  const id = String(workItem.id).padStart(3, '0');
  const slug = slugify(f['System.Title']);
  return `${prefix}-${id}-${slug}`;
}

export function workItemDirPath(workItem, projectName, parentMap) {
  const f = workItem.fields;
  const type = f['System.WorkItemType'];
  const areaPath = f['System.AreaPath'] || projectName;
  const iterationPath = f['System.IterationPath'];

  // Strip project name prefix from area path for folder structure
  const areaRelative = areaPath.startsWith(projectName + '\\')
    ? areaPath.slice(projectName.length + 1).replace(/\\/g, '/')
    : areaPath.replace(/\\/g, '/');

  const areaDir = areaRelative ? `areas/${areaRelative}` : 'areas';

  // Epics always go in backlog
  if (type === 'Epic') {
    return `${areaDir}/backlog`;
  }

  // Features go under their parent epic in backlog
  if (type === 'Feature') {
    const parentEpic = findParent(workItem, parentMap);
    if (parentEpic) {
      const epicFolder = workItemFileName(parentEpic);
      return `${areaDir}/backlog/${epicFolder}`;
    }
    return `${areaDir}/backlog`;
  }

  // Stories/Bugs/Tasks: if they have an iteration, go into iterations/
  // Otherwise, go under their parent feature in backlog/
  if (iterationPath && iterationPath !== projectName) {
    const iterRelative = iterationPath.startsWith(projectName + '\\')
      ? iterationPath.slice(projectName.length + 1).replace(/\\/g, '/')
      : iterationPath.replace(/\\/g, '/');
    return `${areaDir}/iterations/${iterRelative}`;
  }

  // No iteration - put under parent feature in backlog
  const parentFeature = findParent(workItem, parentMap);
  if (parentFeature) {
    const parentEpic = findParent(parentFeature, parentMap);
    if (parentEpic) {
      const epicFolder = workItemFileName(parentEpic);
      const featFolder = workItemFileName(parentFeature);
      return `${areaDir}/backlog/${epicFolder}/${featFolder}`;
    }
    const featFolder = workItemFileName(parentFeature);
    return `${areaDir}/backlog/${featFolder}`;
  }

  return `${areaDir}/backlog`;
}

function findParent(workItem, parentMap) {
  if (!workItem.relations) return null;
  const parentRel = workItem.relations.find(
    (r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse',
  );
  if (!parentRel) return null;
  const parentId = Number(parentRel.url.split('/').pop());
  return parentMap.get(parentId) || null;
}

const ALL_KNOWN_HEADINGS = ['description', 'acceptance criteria', 'repro steps', 'system info'];

/**
 * Validate ## headings in a work item markdown file.
 * Returns an array of { heading, suggestion } for unrecognized headings.
 * Checks against valid headings for the specific work item type.
 */
export function validateHeadings(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const { data, content: body } = matter(content);
  const sections = body.split(/^## /m).filter(Boolean);
  const warnings = [];

  // Get valid headings for this type
  const adoType = data.type === 'Story' ? 'User Story' : data.type;
  const validForType = TYPE_HEADINGS[adoType] || ['description'];

  for (const section of sections) {
    const newlineIdx = section.indexOf('\n');
    const heading = (newlineIdx === -1 ? section : section.slice(0, newlineIdx)).trim();
    if (!heading) continue;
    const headingLower = heading.toLowerCase();

    if (validForType.includes(headingLower)) continue;

    // Try to find a close match within the valid headings for this type first, then all known
    const suggestion = findClosest(headingLower, validForType) || findClosest(headingLower, ALL_KNOWN_HEADINGS);
    const wrongType = ALL_KNOWN_HEADINGS.includes(headingLower) && !validForType.includes(headingLower);
    warnings.push({ heading, suggestion, wrongType, type: data.type });
  }

  return warnings;
}

function findClosest(input, candidates) {
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = levenshtein(input, c);
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function buildParentMap(workItems) {
  const map = new Map();
  for (const wi of workItems) {
    map.set(wi.id, wi);
  }
  return map;
}

function htmlToSimpleMarkdown(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div)>/gi, '\n')
    .replace(/<\/?(b|strong)>/gi, '**')
    .replace(/<\/?(i|em)>/gi, '_')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
