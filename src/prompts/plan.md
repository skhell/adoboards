Distribute the following unassigned user stories across sprints, respecting capacity and dependencies.

**Team capacity:**
- Team size: {{teamSize}} people
- Velocity per person per sprint: {{velocity}} story points
- Sprint length: {{sprintDays}} days
- Total capacity per sprint: {{totalCapacity}} story points

**Available sprints:**
{{sprints}}

**Stories to assign (sorted by business value, highest first):**
{{stories}}

Rules:
- Never exceed sprint capacity
- Higher business value stories should be scheduled earlier
- Respect parent dependencies: if a story's parent feature has other stories, try to group them in the same or adjacent sprints
- Leave 10-20% buffer in each sprint for unplanned work
- If total story points exceed total available capacity, mark overflow stories as "backlog" (no sprint)

Output a JSON array with this format:
```json
[
  { "id": <story-id-or-"pending">, "title": "<title>", "storyPoints": <points>, "sprint": "<iteration-path-or-null>", "reason": "<brief reason>" }
]
```

Output ONLY the JSON array. No commentary.
