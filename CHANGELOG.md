# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.3] - 2026-03-09

### Added

- **`adoboards status`** - Move detection and structural folder warnings
  - Files moved to a different folder now show as `moved` or `moved + modified` instead of `deleted`
  - Matches files by frontmatter `id` against refs, not just by path
  - Shows old path -> new path with a tip to stage and push
  - Detects renamed structural folders (e.g. `itners` instead of `iterations`) and warns
  - Exits with error if `areas/` folder is missing or renamed
- **`adoboards diff`** - Finds moved files by frontmatter ID
  - Previously showed "not tracked" for files moved from their original path
  - Now matches by frontmatter `id` against refs when path lookup fails
- **`adoboards pull`** - Moves files back to their correct location
  - Scans the entire project (not just `areas/`) by frontmatter `id` to find files wherever they are
  - Moved files with no local edits are overwritten with remote content at the correct path
  - Moved files with local edits are moved back to the correct path with edits preserved
  - Moved files with local edits AND remote changes trigger a conflict (`.remote.md`)
  - Cleans up empty directories after moving files back
  - Blocks pull if there are staged files not yet pushed (prevents accidental overwrites)
  - Summary now shows `Moved back` count
- **`adoboards add`** - Move warnings when staging relocated files
  - Shows old path -> new path when staging a file that was moved from its ref location
- **`adoboards clone`** - Guardrail for nested cloning
  - Blocks clone if already inside an adoboards project (detects `.adoboards/` in parent dirs)
  - New `--iteration <path>` flag to filter iterations at clone time
- **Folder structure guardrails** on `add` and `push`
  - Files must be under `areas/` and inside a `backlog/` or `iterations/` folder
  - Catches misspelled folder names (e.g. `iteratoins` -> "did you mean iterations?") via Levenshtein distance
  - Rejects files in unknown structural folders with clear error messages
  - Supports nested area paths (e.g. `areas/Team/Backend/backlog/`)
- **`adoboards config`** - New wizard options
  - `iterationFilter`: set a root iteration path to exclude other teams' iterations (e.g. `Project\TeamA`)
  - `allowFolderEdits`: toggle folder creation protection (default: protected)
### Changed

- **`adoboards pull`** - Full field comparison for local edit detection
  - Now checks all frontmatter fields (title, state, area, iteration, storyPoints, businessValue) and body sections (description, acceptance criteria, repro steps, system info)
  - Previously only checked title and state, which caused silent overwrites of other local edits

## [0.3.1] - 2026-03-08

### Added

- **`adoboards report`** - Offline sprint summary from local files
  - Auto-detects current sprint (most Active items) or use `--sprint <name|number>`
  - Shows progress bar, points breakdown by state, items per state
  - Flags items without story points or assignee
  - Overview mode shows all sprints with progress bars when no sprint specified
  - No API calls - works fully offline
- **`adoboards diff [file]`** - Field-level diff vs last known remote state
  - Compares frontmatter fields and body sections against refs.json snapshot
  - Shows red (remote) / green (local) for changed fields
  - Single file or all modified files
  - Handles description, acceptance criteria, repro steps, system info
  - New items (id: pending) show helpful message instead of error

## [0.2.0] - 2026-03-08

### Added

- **`adoboards gen <idea>`** - Generate work items from an idea using AI
  - Types: hierarchy (epic+features+stories), epic, feature, story
  - `--parent`, `--area`, `--dir`, `--provider` flags
  - Parses AI response into individual markdown files with frontmatter
- **`adoboards optimize [path]`** - AI-optimize work item content
  - Preview mode (default) shows diff, `--apply` writes changes
  - Improves descriptions, acceptance criteria - never modifies frontmatter
- **`adoboards plan`** - AI-powered sprint planning
  - Collects unassigned stories, distributes across sprints by capacity
  - Shows capacity bar per sprint, `--apply` writes iteration to files
- **`src/api/ai.js`** - AI provider abstraction with prompt templating
  - Anthropic (Claude), OpenAI (GPT-4o), Google (Gemini), Azure OpenAI providers
  - `{{variable}}` interpolation in prompt templates
- **Azure OpenAI provider** - Corporate-compliant AI via your company's Azure subscription
  - Uses Azure-specific API format with endpoint, deployment name, and api-version
  - API key stored in KeePass as `adoboards/azure-openai-key` or env var `ADOBOARDS_AZURE_OPENAI_KEY`
  - Config wizard prompts for endpoint and deployment name
  - Use with `--provider azure-openai` or set as default in config
- **AI Persona config** - Configurable role and team context for AI prompts
  - Config wizard prompts for role/title and team description
  - AI adapts tone and domain language to your job (not hardcoded)
  - Defaults to "engineer" / "software development" if not set
- **`adoboards new <type>`** - Create work items from templates without AI
  - Supports: epic, feature, story, bug, task
  - `--title`, `--area`, `--iteration`, `--parent`, `--assignee`, `--dir` flags
  - Auto-populates area and assignee from clone config
  - Dedicated templates per type with inline comments
  - File naming: `PREFIX-pending-slug.md` (e.g. `STORY-pending-deploy-dns.md`)

### Changed

- **Templates match ADO field types** - each type has its own template with correct sections
  - Epic/Task/Issue: `## Description`
  - Feature/Story: `## Description` + `## Acceptance Criteria`
  - Bug: `## Repro Steps` + `## System Info`
  - Dedicated `bug.md` and `task.md` templates added
- **`adoboards push`** - Pre-push validation
  - Type-aware heading validation (e.g. Bug with `## Description` is flagged)
  - Catches typos like `## Desciption` with "did you mean?" suggestions
  - Assignee format validation (must be an email)
  - Better ADO API error messages for invalid assignees
  - Shows valid headings per type when errors found
- **`adoboards new`** - Auto-populates assignee from your identity (resolved during clone)
- **`adoboards clone`** - Resolves your ADO identity via connectionData API and saves email

- **AI is now optional** - CLI works fully without an AI provider
  - Config wizard defaults to `none` for AI provider, with clear skip guidance
  - README updated to clarify AI features (`gen`, `optimize`, `plan`) are opt-in
  - Only `ado-pat` is required in KeePass - AI keys are optional

### Fixed

- **All commands** - Now work from any subdirectory inside the project (walks up to find `.adoboards/`, like git)
- **`adoboards status`** - No longer shows false untracked/deleted items after clone
  - Only scans `areas/` directory (where work items live), skips templates/ and root .md files
  - Files without `id: pending` in non-tracked paths are silently ignored
- **`adoboards add`** - Rejects files with errors instead of staging them
  - Shows clear error + fix instructions per file (missing type, id, title, etc.)
  - Only valid work items are staged
- **`adoboards clone`** - Improved year-filtering regex for iteration folders
  - Now catches patterns like `Q1 2025`, `Y21-A1`, `FY25`, and year with space/dash boundaries
  - Previous regex only matched years bounded by path separators, missing common ADO iteration naming patterns

### Added

- **`adoboards status`**  - Show modified, staged, new (id: pending), deleted, and untracked work items
  - Compares local frontmatter against refs.json snapshot
  - Works fully offline  - no ADO API calls
- **`adoboards add <files...>`**  - Stage files for push
  - Supports individual files, directories, or `.` for all markdown files
  - Deduplicates staged entries
- **`adoboards push [file]`**  - Push work items to Azure DevOps
  - Creates new items (`id: pending` -> POST, writes back real ID to file)
  - Updates existing items (PATCH only changed fields for minimal API calls)
  - Parent linking via `System.LinkTypes.Hierarchy-Reverse` relations
  - Clears staging after successful push
- **`adoboards pull`**  - Pull remote changes from Azure DevOps
  - Fetches items modified since last sync using saved filters (area, state, assignee)
  - Conflict detection: local + remote changes -> writes `.remote.md` for manual diff
  - Updates refs.json and lastSync timestamp

## [0.1.0] - 2026-03-07

### Added

- **`adoboards config`** - Interactive setup wizard with step-by-step guidance
  - ADO org URL and project name configuration
  - Secrets backend selection (KeePass / keytar / env vars)
  - KeePass `.kdbx` path configuration with entry setup instructions
  - Clickable links to PAT generation page and AI provider API key pages
  - AI provider selection (Anthropic / OpenAI / Gemini)
  - Team capacity settings (team size, velocity, sprint length)
  - Direct override: `adoboards config --secrets <backend>`
- **`adoboards clone <url>`** - Clone ADO Boards to local markdown files
  - Parses project from URL (supports `dev.azure.com` and `visualstudio.com`)
  - `--area` flag to scope clone to a specific area path and all sub-areas
  - Builds full folder hierarchy: `areas/` -> `backlog/` and `iterations/`
  - Epics, Features get their own folders; Stories/Bugs/Tasks are individual files
  - Saves state to `.adoboards/config.json` and `refs.json`
- **`src/core/secrets.js`** - Pluggable secrets backend
  - KeePass via `keepassxc-cli` with interactive master password prompt (masked input)
  - Master password cached per session (type once, read all secrets)
  - Auto-detection of unlocked KeePassXC desktop (no prompt needed)
  - Keytar (macOS Keychain / Windows Credential Manager) support
  - Environment variable fallback for CI/CD
  - Detailed error messages for common KeePass issues (entry not found, database locked, wrong password)
- **`src/api/ado.js`** - Azure DevOps REST API client
  - PAT-based authentication (Base64 header, key never stored)
  - Areas and iterations fetch (`$depth=10`)
  - WIQL queries with area filtering (`UNDER` operator)
  - Work item CRUD (get, create, update) with 200-item batch support
  - `json-patch+json` format for create/update operations
- **`src/core/mapper.js`** - ADO JSON to markdown conversion
  - Frontmatter extraction with field mapping (title, state, area, iteration, story points, t-shirt size, business value, assignee, tags, parent)
  - Separate `## Description` and `## Acceptance Criteria` sections
  - HTML to markdown conversion for ADO rich text fields
  - Hierarchy-aware file naming (`EPIC-001-slug`, `FEAT-012-slug`, `STORY-045-slug`)
  - Parent-aware folder placement via relation links
- **`src/core/state.js`** - Local state management for `.adoboards/` folder
- **`src/core/config.js`** - Persistent user config via `conf` with schema validation
- Cross-platform `keepassxc-cli` PATH setup instructions (macOS, Windows, Linux)
- `.env.example` with security warnings and setup instructions
- Initial release of Markdown templates for Epic, Feature, and Story work items
