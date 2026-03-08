I am a {{role}} working on {{context}}.

Generate a complete work item hierarchy from this idea:

**Idea:** {{idea}}
**Area:** {{area}}

Create:
1. One Epic
2. 2-4 Features under the Epic
3. 3-6 User Stories per Feature

For each item, output a complete markdown file with YAML frontmatter. Use this exact format:

For the Epic:
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

<2-3 paragraphs explaining the strategic value, scope, and expected outcomes>
```

For each Feature:
```markdown
---
id: pending
type: Feature
title: "<concise title>"
area: "{{area}}"
iteration: ""
state: New
parent: EPIC
assignee: "{{assignee}}"
tags: [<relevant tags>]
---

## Description

<1-2 paragraphs explaining what this feature delivers>

## Acceptance Criteria

<3-5 checkboxes with measurable criteria>
```

For each User Story:
```markdown
---
id: pending
type: Story
title: "<concise title>"
area: "{{area}}"
iteration: ""
state: New
storyPoints: <1|3|5|8|13>
tshirt: <XS|S|M|L|XL>
businessValue: <1-10>
assignee: "{{assignee}}"
parent: FEAT-<number>
tags: [<relevant tags>]
---

## Description

<1 paragraph explaining what needs to be done and why>

## Acceptance Criteria

- [ ] <specific, testable criterion>
- [ ] <specific, testable criterion>
- [ ] <specific, testable criterion>
```

Rules:
- Story points map to t-shirt: XS=1, S=3, M=5, L=8, XL=13
- Business value reflects impact on the organization (1=low, 10=critical)
- Stories should be independently deliverable within a sprint
- Acceptance criteria must be specific and testable, not vague
- Use language appropriate for a {{role}} in {{context}}
- Tags should be lowercase, relevant technical terms
- Parent references use EPIC for features, FEAT-1/FEAT-2/etc. for stories (numbered sequentially)

Output ONLY the markdown files separated by a line containing exactly: ---FILE---
Do not add any commentary outside the markdown blocks.
