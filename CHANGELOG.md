# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.46] - 2026-03-14

### Added
- **GitHub Copilot provider** with `gh auth token` fallback and secret/env support via `github-copilot-key`
- **`adoboards gen`** now accepts inline text, current-directory files, relative and absolute paths, and `~/.adoboards/gen/YYYY/` idea names; added `--project` and `--assignee`
- **`adoboards pull --force`** to discard local edits, refetch full remote state, and clear the staged index
- **`adoboards clone [url]`** command can be executed without url as can now use saved `orgUrl` and `project` when the URL is omitted

### Changed
- **`adoboards config`** now captures `defaultProjectPath` and `userEmail`, and shows provider-specific idea-file tips plus GitHub Copilot setup guidance
- **`adoboards gen`** now writes generated items into the real backlog layout: Epics and Features as folders, Stories/Bugs/Tasks as flat files
- **`adoboards status`** now uses git-style sections, hash-based change detection, and clearer moved/deleted summaries
- **`adoboards diff`** now reconstructs the last pulled version and shows git-style hunks instead of field-by-field output
- **`adoboards report`** now treats `Committed` as in-progress and reports `Closed` and `Resolved` separately
- **Packaging** now ships `CHANGELOG.md`, includes `marked`, and reads `adoboards --version` directly from `package.json`

### Fixed
- **`adoboards clone`** now stores content hashes in refs, persists `userEmail`, applies default area filters consistently, and creates iteration folders for filtered area subtrees
- **`adoboards pull`** now refreshes `userEmail` on every sync, refreshes iteration folders, preserves move detection via refs hashes, and only emits conflicts when both local and remote changed without `--force`
- **`adoboards push`** now resolves parent placeholders more reliably, renames stale `*-pending-*` paths during updates too, stores content hashes after push, and links parents using the correct ADO `workItems` relation URL
- **`adoboards gen`** now parses multi-file AI output more reliably by handling code fences, missing closing frontmatter markers, YAML task-list noise, and escaped backslashes

## [0.3.39] - 2026-03-13

### Added
- **Epic fields** fully mapped end-to-end:
  - `priority` - `Microsoft.VSTS.Common.Priority` (1=High, 2=Medium, 3=Low, 4=Very Low)
  - `complexity` - `Microsoft.VSTS.Common.Complexity` (1–10)
  - `timeCriticality` - `Microsoft.VSTS.Common.TimeCriticality` (1–10)
  - All added to mapper read/write, `FIELD_MAP`, and `gen-epic.md` template with AI guidance

### Fixed
- **Date parsing fixed**: ADO dates like `1/1/2023 1:00 AM` now correctly converted to `YYYY-MM-DD` using `new Date(val).toISOString().slice(0,10)` instead of `.slice(0,10)` on the raw string
- **Date push fixed**: `toAdoDate()` helper converts `YYYY-MM-DD` user input to full ISO 8601 for ADO API

## [0.3.38] - 2026-03-13

### Added
- **`risk`, `startDate`, `targetDate`, `finishDate`** fields added end-to-end:
  - `mapper.js` - read from ADO on pull/clone (`Microsoft.VSTS.Common.Risk`, `Microsoft.VSTS.Scheduling.StartDate/TargetDate/FinishDate`)
  - `ado.js` - `FIELD_MAP` entries for push/update
  - `gen-feature.md` - Feature gets `risk`, `startDate`, `targetDate`; Story gets `risk`, `startDate`, `finishDate`
  - `gen-epic.md` - same fields added to both Feature and Story templates
  - Dates stored as `YYYY-MM-DD` strings; empty `""` when not set

## [0.3.37] - 2026-03-13

### Fixed
- **`adoboards push`** (update path) - Rich-text fields (`description`, `acceptanceCriteria`, etc.) are now always included in updates when present - previously skipped because refs store HTML while the file has markdown, making string comparison unreliable
- **`adoboards push`** (update path) - Pending folders/files are now renamed to real IDs on update too (not only on create), fixing items pushed before 0.3.35

## [0.3.36] - 2026-03-13

### Added
- Added `marked` dependency for Markdown -> HTML conversion

### Fixed
- **`adoboards push`** - Description, Acceptance Criteria, Repro Steps, and System Info are now converted from Markdown to HTML before sending to ADO. Previously sent as plain text causing compressed display and "We support markdown, you can convert this field" prompt in ADO web UI

## [0.3.35] - 2026-03-13

### Fixed
- **`adoboards push`** - Pending folders and files are renamed to real IDs after successful creation:
  - `FEAT-pending-slug/` -> `FEAT-XXXXXXX-slug/` (folder-based: Epic, Feature)
  - `STORY-pending-slug.md` -> `STORY-2821854-slug.md` (flat files: Story, Bug, Task)
  - Staged and refs paths are updated automatically to match the new names

## [0.3.34] - 2026-03-13

### Fixed
- **`adoboards status`** - Staged pending files no longer appear in the "New work items" section - once staged they only show under "Changes staged for push"

## [0.3.33] - 2026-03-13

### Fixed
- **`adoboards config`** - Now asks for `Your email` (stored as `userEmail`) and shows it in the summary - this is used as the default assignee in `adoboards gen`
- **`adoboards pull`** - Automatically refreshes `userEmail` from ADO's `connectionData` on every pull, keeping it in sync if company email changes. No manual update needed

## [0.3.31] - 2026-03-13

### Fixed
- **`adoboards status`** - Paths containing spaces are now wrapped in double quotes in all output sections (staged, modified, new, moved, deleted, warnings) so they can be safely copy-pasted into `adoboards add`/`adoboards unstage`

## [0.3.30] - 2026-03-13

### Fixed
- **`adoboards unstage`** - Fixed `staged.clear is not a function` crash - `readStaged` returns an array, not a Set; unstage now uses array filtering correctly

## [0.3.29] - 2026-03-13

### Added
- **`adoboards unstage`** - New command to remove files from the staging area
  - `adoboards unstage .` - clears everything staged
  - `adoboards unstage path/to/file.md` - removes a specific file
  - Multiple files supported: `adoboards unstage file1.md file2.md`

## [0.3.28] - 2026-03-13

### Fixed
- **`adoboards gen`** - Stories/Bugs/Tasks now written flat in backlog (alongside Feature folders), matching the real pulled structure. Reverted incorrect nesting inside feature folder introduced in 0.3.27
- **`adoboards push`** - Parent placeholder resolution updated to match flat structure: `FEAT` -> first feature created in this push, `FEAT-1`/`FEAT-2` -> 1-based index into features created in order. Enables correct multi-feature epic push (Epic -> Feature-1, Feature-2 -> Stories resolve by index)

## [0.3.27] - 2026-03-13

### Fixed
- **`adoboards gen`** - Stories/Bugs/Tasks are now written inside their parent Feature folder (`FEAT-pending-slug/STORY-pending-slug.md`) instead of the backlog root. Tracks `lastFeatureFolder` as files are processed in order - works correctly for both `--type feature` (one feature + its stories) and `--type epic` (multiple features each with their own stories)

## [0.3.26] - 2026-03-13

### Fixed
- **`adoboards --version`** - Version is now read dynamically from `package.json` instead of being hardcoded in `bin/adoboards.js` - was stuck at `0.3.14` regardless of `npm version patch` bumps
- **`adoboards gen`** - Generated files now re-serialized through gray-matter so frontmatter format (especially `tags`) matches pull/clone output - block list (`- item`) instead of inline brackets (`[item1, item2]`). Assignee injection also migrated to this re-serialization step (no regex replace needed)

## [0.3.25] - 2026-03-13

### Added
- **`effort` field for Features** - added to `gen-feature.md` and `gen-epic.md` prompts, mapper read (`Microsoft.VSTS.Scheduling.Effort`), and `FIELD_MAP` in `ado.js` so it round-trips correctly through push/pull

### Fixed
- **`businessValue` missing from generated Features** - added to Feature frontmatter template in both `gen-feature.md` and `gen-epic.md`

## [0.3.24] - 2026-03-13

### Fixed
- **`adoboards gen`** - Assignee now reliably injected into all generated files (Feature, Stories, etc.) via post-processing after AI response - AI can no longer silently output `assignee: ""` when a userEmail is configured

## [0.3.23] - 2026-03-12

### Fixed
- **`adoboards push`** - Pending items in a hierarchy are now created in correct dependency order
  - Sorts staged pending items: Epic -> Feature -> Story/Bug/Task before pushing
  - Resolves `parent: FEAT` placeholder to the real ADO ID of the feature just created in the same folder
  - Resolves `parent: EPIC` placeholder to the real ADO ID of the epic created in the same push batch
  - Already-tracked (non-pending) items preserve their original order

## [0.3.22] - 2026-03-12

### Changed
- **`adoboards gen --type epic`** - Now generates full hierarchy: Epic + Features + Stories (was single Epic only)
- **`adoboards gen --type feature`** - Now generates Feature + Stories (was single Feature only)
- **`adoboards gen`** (no type / `--type hierarchy`) - unchanged, still generates Epic + Features + Stories
- **`adoboards gen --type story`** - unchanged, still generates a single Story

## [0.3.21] - 2026-03-12

### Fixed
- **`adoboards gen`** - Feature/story body (description, acceptance criteria) no longer stripped from generated files
  - Root cause: multi-frontmatter split regex was splitting on the closing `---` of the frontmatter, separating the body into a discarded second block
  - Fixed: split only when `---` is followed by known YAML keys (`id:`, `type:`, `title:`, etc.)
- **`adoboards gen`** - Assignee now defaults to user email (`config.userEmail` -> global `userEmail` -> empty)
- **`adoboards gen`** - Skip message now correctly reports which field is missing (type or title)
- **`adoboards clone`** - User email saved to global config so `gen` can resolve the assignee from any directory

### Added
- **`adoboards gen --assignee <email>`** - Override the default assignee

## [0.3.20] - 2026-03-11

### Fixed
- **`adoboards gen`** - Idea file in current working directory now checked before `~/.adoboards/gen/YEAR/`

## [0.3.19] - 2026-03-11

### Changed
- **`adoboards gen`** - `CHANGELOG.md` added to npm package `files` field
- Removed empty dead file `src/core/differ.js`

## [0.3.18] - 2026-03-11

### Added
- **`adoboards gen`** - Flexible idea resolution from any path
  - Relative paths (e.g. `./ideas/feature.md`) resolve from current working directory
  - Absolute paths and `~/` paths read file directly
  - Names with or without `.md` extension (no slashes) resolve from `~/.adoboards/gen/YEAR/`
  - Plain inline text still works as before
  - Resolution order documented in `--help`

## [0.3.17] - 2026-03-10

### Fixed
- **`adoboards gen`** - Idea file year fallback: searches current year back 2 years so ideas written in a previous year are still found

## [0.3.16] - 2026-03-10

### Added
- **`adoboards gen`** - Idea file support: store elaborate ideas as markdown files instead of inline text
  - Names resolve from `~/.adoboards/gen/YEAR/NAME.md` automatically
  - `--project <path>` flag to run `gen` from outside an adoboards project
  - Falls back to global `defaultProjectPath` config when not inside a project
- **`adoboards config`** - New settings
  - `defaultProjectPath`: set once, run `adoboards gen` from anywhere
  - Provider-specific idea file formatting tips shown after selecting AI provider
- **`adoboards gen --help`** - Extended help with idea file pattern and examples

## [0.3.15] - 2026-03-10

### Fixed
- **`adoboards pull`** - Store `parent` work item ID in `refs.json` entries so the VS Code extension can reconstruct the original markdown correctly

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
