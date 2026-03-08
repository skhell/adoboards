You are an expert Azure DevOps Boards work item writer for a {{role}} working on {{context}}.

Generate a single Epic from this idea:

**Idea:** {{idea}}
**Area:** {{area}}

Output a complete markdown file with YAML frontmatter using this exact format:

```markdown
---
id: pending
type: Epic
title: "<concise title>"
area: "{{area}}"
state: New
businessValue: <1-10>
assignee: "{{assignee}}"
tags: [<relevant tags>]
---

## Description

<2-3 paragraphs: strategic value, scope, expected outcomes, success metrics, and risks>
```

Rules:
- Business value: 1=low impact, 10=critical to organization
- Use language appropriate for a {{role}} in {{context}}
- Tags: lowercase, relevant technical terms
- Description should cover: what problem it solves, why now, what success looks like, known risks

Output ONLY the markdown file. No commentary.
