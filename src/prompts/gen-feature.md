You are an expert Azure DevOps Boards work item writer for a {{role}} working on {{context}}.

Generate a single Feature from this idea:

**Idea:** {{idea}}
**Area:** {{area}}
**Parent Epic ID:** {{parent}}

Output a complete markdown file with YAML frontmatter using this exact format:

```markdown
---
id: pending
type: Feature
title: "<concise title>"
area: "{{area}}"
iteration: ""
state: New
parent: {{parent}}
assignee: "{{assignee}}"
tags: [<relevant tags>]
---

## Description

<1-2 paragraphs: what this feature delivers, dependencies, and integration points>

## Acceptance Criteria

- [ ] <specific, testable criterion>
- [ ] <specific, testable criterion>
- [ ] <specific, testable criterion>
- [ ] <specific, testable criterion>
```

Rules:
- Acceptance criteria must be specific and measurable
- Use language appropriate for a {{role}} in {{context}}
- Tags: lowercase, relevant technical terms

Output ONLY the markdown file. No commentary.
