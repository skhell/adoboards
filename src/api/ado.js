import axios from 'axios';
import config from '../core/config.js';
import * as secrets from '../core/secrets.js';

const API_VERSION = '7.1';

export const FIELD_MAP = {
  title: 'System.Title',
  state: 'System.State',
  area: 'System.AreaPath',
  iteration: 'System.IterationPath',
  assignee: 'System.AssignedTo',
  description: 'System.Description',
  storyPoints: 'Microsoft.VSTS.Scheduling.StoryPoints',
  businessValue: 'Microsoft.VSTS.Common.BusinessValue',
  acceptanceCriteria: 'Microsoft.VSTS.Common.AcceptanceCriteria',
  tags: 'System.Tags',
  parent: 'System.Parent',
};

async function makeHeaders() {
  const pat = await secrets.get('ado-pat');
  return {
    'Authorization': `Basic ${Buffer.from(':' + pat).toString('base64')}`,
    'Content-Type': 'application/json',
  };
}

function baseUrl(orgUrl, project) {
  const org = orgUrl || config.get('orgUrl');
  const proj = project || config.get('project');
  if (!org || !proj) {
    throw new Error('ADO org URL and project not configured. Run: adoboards config');
  }
  return `${org.replace(/\/$/, '')}/${encodeURIComponent(proj)}/_apis`;
}

export async function getAreas(orgUrl, project) {
  const headers = await makeHeaders();
  const url = `${baseUrl(orgUrl, project)}/wit/classificationnodes/areas`;
  const res = await axios.get(url, {
    headers,
    params: { $depth: 10, 'api-version': API_VERSION },
  });
  return res.data;
}

export async function getIterations(orgUrl, project) {
  const headers = await makeHeaders();
  const url = `${baseUrl(orgUrl, project)}/wit/classificationnodes/iterations`;
  const res = await axios.get(url, {
    headers,
    params: { $depth: 10, 'api-version': API_VERSION },
  });
  return res.data;
}

export async function queryWorkItems(wiql, orgUrl, project) {
  const headers = await makeHeaders();
  const url = `${baseUrl(orgUrl, project)}/wit/wiql`;
  const res = await axios.post(url, { query: wiql }, {
    headers,
    params: { 'api-version': API_VERSION },
  });
  return res.data;
}

export async function getWorkItems(ids, orgUrl, project) {
  if (!ids.length) return [];

  const headers = await makeHeaders();
  const base = baseUrl(orgUrl, project);
  const results = [];

  // ADO limits to 200 IDs per request
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const url = `${base}/wit/workitems`;
    const res = await axios.get(url, {
      headers,
      params: {
        ids: batch.join(','),
        $expand: 'all',
        'api-version': API_VERSION,
      },
    });
    results.push(...res.data.value);
  }

  return results;
}

export async function createWorkItem(type, fields, orgUrl, project) {
  const headers = await makeHeaders();
  headers['Content-Type'] = 'application/json-patch+json';
  const url = `${baseUrl(orgUrl, project)}/wit/workitems/$${encodeURIComponent(type)}`;

  const patchDoc = Object.entries(fields).map(([key, value]) => ({
    op: 'add',
    path: `/fields/${FIELD_MAP[key] || key}`,
    value,
  }));

  const res = await axios.post(url, patchDoc, {
    headers,
    params: { 'api-version': API_VERSION },
  });
  return res.data;
}

export async function updateWorkItem(id, fields, orgUrl, project) {
  const headers = await makeHeaders();
  headers['Content-Type'] = 'application/json-patch+json';
  const url = `${baseUrl(orgUrl, project)}/wit/workitems/${id}`;

  const patchDoc = Object.entries(fields).map(([key, value]) => ({
    op: 'add',
    path: `/fields/${FIELD_MAP[key] || key}`,
    value,
  }));

  const res = await axios.patch(url, patchDoc, {
    headers,
    params: { 'api-version': API_VERSION },
  });
  return res.data;
}

export async function getAllWorkItems(orgUrl, project, { area, since, states, assignees } = {}) {
  let wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project`;
  if (area) {
    const safeArea = area.replace(/'/g, "''");
    wiql += ` AND [System.AreaPath] UNDER '${safeArea}'`;
  }
  if (since) {
    wiql += ` AND [System.ChangedDate] >= '${since}'`;
  }
  if (states?.length) {
    const stateList = states.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
    wiql += ` AND [System.State] IN (${stateList})`;
  }
  if (assignees?.length) {
    if (assignees.length === 1 && assignees[0] === '@me') {
      wiql += ` AND [System.AssignedTo] = @me`;
    } else {
      const userList = assignees.map((u) => `'${u.replace(/'/g, "''")}'`).join(', ');
      wiql += ` AND [System.AssignedTo] IN (${userList})`;
    }
  }
  wiql += ` ORDER BY [System.Id]`;
  const result = await queryWorkItems(wiql, orgUrl, project);
  const ids = result.workItems.map((wi) => wi.id);
  if (!ids.length) return [];
  return getWorkItems(ids, orgUrl, project);
}
