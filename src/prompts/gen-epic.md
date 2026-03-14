I am a {{role}} working on {{context}}.

Generate a complete work item hierarchy starting from an Epic for this idea:

**Idea:** {{idea}}
**Area:** {{area}}
**Parent (if any):** {{parent}}

Create:
1. One Epic
2. 2-4 Features under the Epic
3. 3-5 User Stories per Feature

For the Epic:
```markdown
---
id: pending
type: Epic
title: "<concise title>"
area: "{{area}}"
state: New
priority: <1|2|3|4>
businessValue: <1-10>
timeCriticality: <1-10>
effort: <1-100>
risk: "<1 - High|2 - Medium|3 - Low>"
complexity: <1-10>
startDate: ""
targetDate: ""
assignee: "{{assignee}}"
tags: [<relevant tags>]
---

## Description

<2-3 paragraphs: strategic value, scope, expected outcomes, success metrics, and risks>
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
effort: <1-100>
businessValue: <1-10>
risk: "<1 - High|2 - Medium|3 - Low>"
startDate: ""
targetDate: ""
assignee: "{{assignee}}"
tags: [<relevant tags>]
---

## Description

<1-2 paragraphs explaining what this feature delivers>

## Acceptance Criteria

- [ ] <specific, measurable criterion>
- [ ] <specific, measurable criterion>
- [ ] <specific, measurable criterion>
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
risk: "<1 - High|2 - Medium|3 - Low>"
startDate: ""
finishDate: ""
assignee: "{{assignee}}"
parent: FEAT-<number>
tags: [<relevant tags>]
---

## Description

<1 paragraph: what needs to be done, why, and the expected outcome>

## Acceptance Criteria

- [ ] <specific, testable criterion>
- [ ] <specific, testable criterion>
- [ ] <specific, testable criterion>
```

Rules:
- Epic priority: 1=high, 2=medium, 3=low, 4=very low
- Epic complexity/businessValue/timeCriticality: 1=low, 10=critical - infer from context
- Epic effort: total estimated engineering days across all features (e.g. 30, 60, 90)
- Epic risk: "1 - High", "2 - Medium", or "3 - Low" - use the exact string format
- Feature effort: total estimated engineering days (e.g. 5, 10, 20)
- Story points map to t-shirt: XS=1, S=3, M=5, L=8, XL=13
- Business value: 1=low impact, 10=critical to organization
- Stories must be independently deliverable within a single sprint
- Acceptance criteria must be specific and testable
- Use language appropriate for a {{role}} in {{context}}
- Tags: lowercase, relevant technical terms
- Parent references: use EPIC for features, FEAT-1/FEAT-2/etc. for stories (numbered sequentially)

Output ONLY the markdown files separated by a line containing exactly: ---FILE---
Do not add any commentary outside the markdown blocks.
