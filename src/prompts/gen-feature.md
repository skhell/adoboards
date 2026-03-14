I am a {{role}} working on {{context}}.

Generate a Feature and its child User Stories from this idea:

**Idea:** {{idea}}
**Area:** {{area}}
**Parent Epic ID:** {{parent}}

Create:
1. One Feature
2. 3-6 User Stories under the Feature

For the Feature:
```markdown
---
id: pending
type: Feature
title: "<concise title>"
area: "{{area}}"
iteration: ""
state: New
parent: {{parent}}
effort: <1-100>
businessValue: <1-10>
risk: "<1 - High|2 - Medium|3 - Low>"
startDate: ""
targetDate: ""
assignee: "{{assignee}}"
tags: [<relevant tags>]
---

## Description

<1-2 paragraphs: what this feature delivers, dependencies, and integration points>

## Acceptance Criteria

- [ ] <specific, measurable criterion>
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
parent: FEAT
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
- Feature effort: total estimated engineering days (e.g. 5, 10, 20)
- Story points map to t-shirt: XS=1, S=3, M=5, L=8, XL=13
- Business value: 1=low impact, 10=critical
- Stories must be independently deliverable within a single sprint
- Acceptance criteria must be specific and testable, not vague
- Use language appropriate for a {{role}} in {{context}}
- Tags: lowercase, relevant technical terms
- Stories use `parent: FEAT` as a placeholder (the push command will link them)

Output ONLY the markdown files separated by a line containing exactly: ---FILE---
Do not add any commentary outside the markdown blocks.
