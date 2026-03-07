# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **AI is now optional** - CLI works fully without an AI provider
  - Config wizard defaults to `none` for AI provider, with clear skip guidance
  - README updated to clarify AI features (`gen`, `optimize`, `plan`) are opt-in
  - Only `ado-pat` is required in KeePass - AI keys are optional

### Fixed

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
