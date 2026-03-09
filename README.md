## NPM CLI for Azure DevOps Boards with AI support<!-- omit in toc -->

![adoboards](https://raw.githubusercontent.com/skhell/adoboards/main/.github/media/homer.gif)

_If you feel like **Homer Simpson backing into bushes** right before sprint review, you are in the right place._

We've all been there. You're very busy into actual work and then someone reminds you that your user stories need descriptions, acceptance criteria, t-shirt sizes, and business value fields filled in before tomorrow's ceremony. The first time I heard "ceremony" I genuinely thought it was some kind of cult initiation.

Don't get me wrong **Scrum** and the job of **Scam Masters** are genuinely good _when used properly_. But let's be honest: most of us have seen it applied in ways that create more overhead than value, especially for architecture and infrastructure work where the real complexity lives in the system design, not in a Jira ticket template.

After nearly 20 years in the industry, I noticed something: the time spent writing and grooming work items is often disproportionate to the value they deliver. So inspired by `git` cli commands I built a tool to fix that.

**adoboards** is a CLI that pulls your Epics, Features, and User Stories from Azure DevOps Boards, organizes them locally as markdown files, and **optionally** lets AI handle the tedious writing for you.

You can quickly:
1. Work from CLI with git-like commands (`clone`, `push`, `pull`, `status`, `diff`, `add`)
2. Create work items from templates manually - no AI required, no corporate restrictions
3. **Optionally** generate Epics, Features, and User Stories with **Claude**, **ChatGPT**, **Gemini**, or **Azure OpenAI** - API keys safely stored in KeePass (recommended)
4. Let AI **optimize** existing items so you stop guessing _"what do I pick for t-shirt size or business value?"_
5. **Plan** entire sprints with AI-powered capacity distribution
6. Generate **sprint reports** from local state in seconds - ready to paste into emails or meetings

The CLI is **fully functional without AI**. Clone, edit, push, pull, status - all work with just your ADO PAT. AI features (`gen`, `optimize`, `plan`) are there when you want them, but never mandatory. If your org restricts API access, you lose nothing - the core workflow stands on its own.

Less time writing about work, more time doing the work.

## Table of content<!-- omit in toc -->
- [Install guide](#install-guide)
  - [Requirements](#requirements)
  - [Install from npm](#install-from-npm)
  - [Install from source (for development)](#install-from-source-for-development)
  - [Setup wizard](#setup-wizard)
  - [Secrets](#secrets)
- [Commands](#commands)
  - [Clone your boards locally](#clone-your-boards-locally)
  - [Create new work items (no AI needed)](#create-new-work-items-no-ai-needed)
  - [Check what changed](#check-what-changed)
  - [Stage and push changes to ADO](#stage-and-push-changes-to-ado)
  - [Pull remote changes](#pull-remote-changes)
  - [Generate sprint reports (offline)](#generate-sprint-reports-offline)
- [Burnout-Free, LLM-Assisted content](#burnout-free-llm-assisted-content)
  - [Generate work items from an idea](#generate-work-items-from-an-idea)
  - [Optimize existing work items](#optimize-existing-work-items)
  - [AI-powered sprint planning](#ai-powered-sprint-planning)
  - [Feedback](#feedback)


## Install guide

### Requirements

- **Node.js 18+** (ESM modules)
- **KeePassXC** (recommended) with `keepassxc-cli` configured on your `PATH` for secrets management
- An **Azure DevOps** organization with Boards enabled
- **Optional:** an AI provider API key (Anthropic, OpenAI, Google Gemini, or Azure OpenAI for business/corporate compliant environments) for content generation features

### Install from npm

```bash
npm install -g adoboards
adoboards --version
```

That's it. One command, globally available.

### Install from source (for development)

```bash
git clone https://github.com/skhell/adoboards.git
cd adoboards
npm install
npm install -g .
adoboards --version
```

### Setup wizard

Run the interactive config wizard it walks you through everything:

```bash
adoboards config
```

It will ask for:
1. Your Azure DevOps **org URL** and **project name**
2. A **default area path** (e.g. `YourTeam/DCArchitecture`)
3. **Secrets backend** KeePass (recommended), OS keychain, or local env vars
4. Path to your **`.kdbx` file** (if using KeePass)
5. Your preferred **AI provider** (optional - skip if you don't have API access)
6. **AI persona** describe your role/title and what your team does - will be used by AI promt to write in your domain language
7. **Team capacity** team size, velocity per person, sprint length
8. **Reports directory** where sprint reports are saved (default: `./reports/`)

Or skip the wizard and set the secrets backend directly:

```bash
adoboards config --secrets keepass
adoboards config --secrets env
```

### Secrets
Let's talk about the elephant in the room: **where do your API keys live?**

Most CLI tools want you to dump secrets in a `.env` file or some plain-text config. That's fine until your laptop gets stolen, your disk gets cloned, or your manager's "IT audit" script scans your home directory. Fun times.

**adoboards** supports three backends pick your poison:

| Backend | How it works | Best for |
|---|---|---|
| **KeePass** (default) | Reads secrets from your `.kdbx` file via `keepassxc-cli` | Corporate laptops where KeePass is already org-approved |
| **Keytar** | Uses macOS Keychain / Windows Credential Manager | Personal machines without KeePass |
| **Env vars** | Reads `ADOBOARDS_ADO_PAT`, `ADOBOARDS_ANTHROPIC_KEY`, etc. | CI/CD pipelines, headless Linux boxes |

#### Why KeePass is the default
- It's probably **already installed and approved** on your corporate machine no security team arguments
- AES-256 encryption with a master password only you know **even root can't read it**
- Your keys are **not in memory** when adoboards isn't running (unlike env vars sitting in your shell profile)
- Cross-platform: works on macOS, Windows, Linux
- You were going to store these keys _somewhere_ anyway might as well be the vault IT already trusts

#### Getting keepassxc-cli on your PATH

KeePassXC desktop app includes `keepassxc-cli`, but it's not always on your PATH by default. Here's how to fix that:

**macOS** (Homebrew or standalone .dmg):

```bash
# If installed via Homebrew cask (most common)
brew install --cask keepassxc

# The CLI is buried inside the .app bundle. Symlink it:
sudo ln -s /Applications/KeePassXC.app/Contents/MacOS/keepassxc-cli /usr/local/bin/keepassxc-cli

# Verify
keepassxc-cli --version
```
> [!NOTE]
> If you installed via `.dmg` and KeePassXC is in `/Applications`, the symlink command above works the same.

**Windows:**

```powershell
# If installed via default installer, the CLI is at:
# C:\Program Files\KeePassXC\keepassxc-cli.exe

# Add to PATH permanently (run in Admin PowerShell):
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\KeePassXC", "User")

# Or with winget:
winget install KeePassXCTeam.KeePassXC
# Then add to PATH as above

# Verify (restart terminal first)
keepassxc-cli --version
```

**Linux:**

```bash
# Debian/Ubuntu
sudo apt install keepassxc

# Fedora
sudo dnf install keepassxc

# Arch
sudo pacman -S keepassxc

# CLI is included and already on PATH after install
keepassxc-cli --version
```

After this, `adoboards config` should show: **keepassxc-cli detected on PATH**.

#### How it actually works under the hood

adoboards never sees your master password. It calls `keepassxc-cli` as a subprocess:

```bash
keepassxc-cli show -a Password ~/secrets.kdbx "adoboards/ado-pat"
# -> KeePassXC prompts for master password (in its own process)
# -> returns the secret on stdout
# -> adoboards grabs it, uses it, lets it go out of scope
# -> secret never stored in any object, file, or log
```

If KeePassXC desktop is already open and unlocked, the secret service socket kicks in **no prompt needed**. So after the first unlock of your day, it's seamless.

#### KeePass entry setup
**adoboards** does not create KeePass entries for you and that's on purpose. Creating entries would mean your secrets pass through our code during setup, which violates the whole point. You set them up once, by hand, and adoboards only ever _reads_ them.

1. Open your `.kdbx` file in KeePassXC
2. Right-click the root group -> **New Group** -> name it `adoboards`
3. Inside that group, create entries (right-click -> **New Entry**):

| Entry title (Title field) | Password field contains |
|---|---|
| `ado-pat` | Your Azure DevOps Personal Access Token |
| `anthropic-key` | Anthropic Claude API key |
| `openai-key` | OpenAI ChatGPT API key |
| `gemini-key` | Google Gemini API key |
| `azure-openai-key` | Azure OpenAI Service API key |

You only need `ado-pat` to use the CLI. AI provider keys are optional - add one only if you want `gen`, `optimize`, or `plan` features.

#### How to get your Azure DevOps PAT (even with corporate SSO)
If your org uses single sign-on (SAML, Entra ID, ADFS, etc.) you can still create a PAT SSO handles the browser login, and the PAT is generated _after_ you're authenticated.

1. Sign in to Azure DevOps in your browser (SSO handles auth as usual)
2. Click your **profile icon** (top right) -> **Personal access tokens**
   - Or go directly to: `https://dev.azure.com/YOUR_ORG/_usersSettings/tokens`
3. Click **New Token**
   - **Name:** `adoboards`
   - **Organization:** select your org (or "All accessible organizations" if allowed)
   - **Expiration:** set the maximum your org allows (often 1 year)
   - **Scopes:** select **Custom defined**, then enable:
     - **Work Items** -> **Read & Write**
     - That's it adoboards doesn't need anything else
4. Click **Create** and **copy the token immediately** Azure shows it only once
5. In KeePassXC: open your `adoboards/ado-pat` entry -> paste the token into the **Password** field -> Save

> [!NOTE]
> **If "New Token" is greyed out or you get a permissions error:** your org admin may have restricted PAT creation. Check with your IT/DevOps team some orgs require you to request PAT permissions through an internal portal or open ticket first to your service desk.

#### How to get your AI provider API key

| Provider | Where to get it |
|---|---|
| **Anthropic (Claude)** | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) -> Create Key |
| **OpenAI (ChatGPT)** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) -> Create new secret key |
| **Google (Gemini)** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) -> Create API key |
| **Azure OpenAI** | Azure Portal -> your OpenAI resource -> Keys and Endpoint |

Copy the key -> paste it as the **Password** of the matching KeePass entry (e.g. `adoboards/anthropic-key`).

#### Azure OpenAI Service (corporate compliance)

If your organization provides Azure OpenAI Service, you can use it instead of a personal API key. This keeps everything on your company's Azure subscription - fully compliant, no personal spend.

1. Run `adoboards config` and select `azure-openai` as AI provider
2. Enter your Azure OpenAI **endpoint** (e.g. `https://your-resource.openai.azure.com`)
3. Enter your **deployment name** (the model you deployed, e.g. `gpt-4o`)
4. Get your API key from Azure Portal -> your OpenAI resource -> **Keys and Endpoint** -> copy Key 1
5. Store the key:
   - KeePass: create entry `adoboards/azure-openai-key` with the key as Password
   - Env vars: `export ADOBOARDS_AZURE_OPENAI_KEY="your-key"`

Then use it:

```bash
adoboards gen "Migrate DNS to Azure" --provider azure-openai
```

Or set it as default in `adoboards config` and skip `--provider` entirely.

#### Switching backends

```bash
# During setup wizard
adoboards config

# Or directly
adoboards config --secrets keepass
adoboards config --secrets keytar
adoboards config --secrets env
```

#### Env vars backend (CI/headless only not recommended for daily use)

> [!NOTE]
> **Not recommended for your personal machine.** Env vars sit in plain text in your shell profile, `.env` file, or process environment. Anyone with read access to your home directory can see them. A leaked `.env` in a git push and your keys are on GitHub forever.
>
> Use env vars **only** for CI/CD pipelines, Docker containers, or headless Linux servers where you can't run KeePassXC.

If you still want to use it:

```bash
# Option A: export directly in your shell
export ADOBOARDS_ADO_PAT="your-pat-here"
export ADOBOARDS_ANTHROPIC_KEY="sk-ant-..."    # if using Claude
export ADOBOARDS_OPENAI_KEY="sk-..."           # if using ChatGPT
export ADOBOARDS_GEMINI_KEY="AI..."            # if using Gemini
export ADOBOARDS_AZURE_OPENAI_KEY="..."        # if using Azure OpenAI in your business/enterprise environment

# Option B: use the .env template
cp .env.example .env
# Edit .env with your actual values
adoboards config --secrets env
```

The `.env.example` file has all the variable names with comments explaining where to get each key.

---

## Commands

### Clone your boards locally

Just like git one URL, project included:

```bash
# Clone current year's active items (default - skips Closed/Removed and old history)
adoboards clone https://dev.azure.com/acmecorp/YourProject

# Clone EVERYTHING - all years, all states including Closed/Removed
adoboards clone https://dev.azure.com/acmecorp/YourProject --all

# Clone only YOUR items - the stuff assigned to you
adoboards clone https://dev.azure.com/acmecorp/YourProject --assignee @me

# Clone only your team's area
adoboards clone https://dev.azure.com/acmecorp/YourProject --area "YourProject\YourTeam\DCArchitecture"

# Combine filters - your area, your items, this year
adoboards clone https://dev.azure.com/acmecorp/YourProject --area "YourProject\Network Team" --assignee @me

# Clone items from specific colleagues
adoboards clone https://dev.azure.com/acmecorp/YourProject --assignee "alice@company.com,bob@company.com"

# Clone items changed since a specific date
adoboards clone https://dev.azure.com/acmecorp/YourProject --since 2025-06-01

# Works with old-style URLs too
adoboards clone https://acmecorp.visualstudio.com/YourProject --area "YourProject\YourTeam"
```

#### Clone filters

| Flag | Default | What it does |
|---|---|---|
| `--area <path>` | _(none - entire project)_ | Only items under this area path and all sub-areas beneath it |
| `--assignee <users>` | _(none - all users)_ | `@me` for your items, or comma-separated emails for specific people |
| `--since <date>` | Jan 1 of current year | Only items changed since this date |
| `--all` | _(off)_ | Disable all filters - clone everything including Closed/Removed items and all history |

By default, clone skips **Closed** and **Removed** items and only pulls items changed since **January 1st of the current year**. This keeps your local tree focused on what matters now - not the 8000 stories from 2019 nobody will ever read again.

Area matching is **case-insensitive** `"YourProject\network team"` works the same as `"YourProject\Network Team"`. Just wrap the value in quotes so the shell doesn't split on spaces.

The `--area` flag uses ADO's `UNDER` operator it grabs the area you specify **plus every sub-area beneath it**, no matter how deep. So if your area has 5 sub-sections with their own children, they all come down.

Locally, the full area hierarchy is preserved as folders:

```text
YourProject/
|--- areas/
    |--- YourTeam/
        |--- DCArchitecture/
            |--- SubA/            <- all sub-areas become subfolders
            │   |--- backlog/
            |--- SubB/
            │   |--- backlog/
            |--- backlog/             <- items directly in DCArchitecture
            |--- iterations/
                |--- 2026-Q2/
                    |--- Sprint-4/
```

### Create new work items (no AI needed)

Create items in your backlog first, then move them into sprints when they're ready - just like you would in ADO:

```bash
# Create items directly in the backlog folder
adoboards new story --title "Deploy DNS resolver east-us" --dir areas/TeamName/backlog
adoboards new feature --title "Automate firewall rules" --parent 42 --dir areas/TeamName/backlog
adoboards new epic --title "Zero trust network segmentation" --dir areas/TeamName/backlog
adoboards new bug --title "DNS timeout under load" --dir areas/TeamName/backlog
adoboards new task --title "Update runbook for failover" --dir areas/TeamName/backlog
```

Each command creates a blank template with `id: pending`. Open it in your editor, fill in the details, then push:

```bash
adoboards add areas/TeamName/backlog/STORY-pending-deploy-dns-resolver-east-us.md
adoboards push
```

#### Moving items into sprints

When a story is ready for a sprint, move the file from `backlog/` to the sprint folder and update the `iteration` field in the frontmatter. You can do this from VSCode (drag and drop) or from the terminal:

```bash
mv areas/TeamName/backlog/STORY-pending-deploy-dns.md areas/TeamName/iterations/2026-Q2/Sprint-4/
```

Then edit the frontmatter to match:

```yaml
iteration: "YourProject\2026-Q2\Sprint-4"
```

Push the change and ADO picks up the new sprint assignment.

#### Other options

```bash
# Set area and iteration at creation time (skip backlog, go straight to sprint)
adoboards new story --title "Urgent fix" --iteration "2026-Q2/Sprint-4" --dir areas/TeamName/iterations/2026-Q2/Sprint-4

# Create in current directory (if you're already in the right folder)
adoboards new story --title "Quick item"
```

Area is auto-populated from your clone config if `--area` is not provided.

### Check what changed

```bash
adoboards status          # What's modified, new, moved, or deleted locally
adoboards diff            # Field-level diff of all modified files vs remote
adoboards diff story.md   # Diff a single file
```

`status` tracks files by their frontmatter `id`, not just file path. If you move a file to a different folder, it shows as `moved` (not `deleted`). If you also edited it, it shows as `moved + modified`.

`diff` compares your local frontmatter and body sections against the last known remote state (stored in refs.json). Shows red for remote values and green for local changes - per field, not per line.

### Stage and push changes to ADO

```bash
adoboards add .           # Stage everything
adoboards add story.md    # Stage a specific file
adoboards push            # Push staged changes to Azure DevOps
```

New items (`id: pending`) get created in ADO. Existing items get patched with only the changed fields.

### Pull remote changes

```bash
adoboards pull            # Sync remote changes to local files
```

Pull works like `git pull` - it restores the correct folder structure from ADO. If you moved files around locally, pull moves them back to where they belong. If you edited a file AND moved it, your edits are preserved but the file goes back to the correct path. If both you and someone on ADO changed the same item, you get a `.remote.md` conflict file to resolve manually.

#### Folder guardrails

By default, `add` and `push` enforce that files live under the correct folder structure (`areas/<team>/backlog/` or `areas/<team>/iterations/<sprint>/`). This prevents accidents like renaming `iterations` to `iteratoins` which would break syncing.

If you need to create custom folders (e.g. for a new area path not yet in ADO), set `allowFolderEdits: true` in `.adoboards/config.json`. Structural folders (`areas`, `backlog`, `iterations`) are always protected regardless of this setting.

### Generate sprint reports (offline)

```bash
adoboards report                    # Overview of all sprints with progress bars
adoboards report --sprint 4         # Detailed report for a specific sprint
adoboards report --sprint Sprint-4  # Or by name
```

Without `--sprint`, you get a global overview - all sprints listed with progress bars, points, and item counts. With `--sprint`, you get the detailed breakdown: items grouped by state, assignees, and attention flags for missing story points or assignees.

No API calls - works entirely from your local files.

Reports are saved as markdown files to your configured reports directory (default: `./reports/`). Set it during `adoboards config` or just let it default. File names include the date: `2026-03-08-sprint-4.md`. Ready to paste into email, Teams, or attach to a ceremony invite.

---

## Burnout-Free, LLM-Assisted content

This is where the magic happens. Stop staring at empty fields with just a title and let AI fill them in.

AI adapts to your role and domain. During `adoboards config`, set your **role** (e.g. "Senior Solution Architect") and **team context** (e.g. "Infrastructure and cloud platform, Azure/AWS"). The AI uses this to write in your language - not generic consumer speak.

### Generate work items from an idea

```bash
# Full hierarchy: Epic > Features > Stories from one sentence
adoboards gen "Migrate on-prem DNS to Azure Private DNS"

# Just an epic
adoboards gen "Zero-trust network segmentation" --type epic

# A feature under an existing epic
adoboards gen "Automate firewall rule deployment" --type feature --parent 42

# Stories for a feature
adoboards gen "DNS failover testing" --type story --parent 67
```

Pick your AI provider per command if you want:

```bash
adoboards gen "..." --provider openai
adoboards gen "..." --provider gemini
adoboards gen "..." --provider azure-openai
```

### Optimize existing work items

Already have stories but they're vague, missing acceptance criteria, or have nonsensical t-shirt sizes?

```bash
adoboards optimize areas/YourTeam/    # Optimize everything under an area
adoboards optimize story.md           # Optimize a single file
adoboards optimize story.md --apply   # Skip the diff preview, just do it
```

AI rewrites descriptions, acceptance criteria, business value justification, and t-shirt rationale but **never touches your metadata** (IDs, state, assignments, iterations).

### AI-powered sprint planning

```bash
adoboards plan --quarter Q2
adoboards plan --quarter Q2 --apply   # Apply the plan to files immediately
```

Collects unassigned stories, reads your team capacity config, and uses AI to distribute work across sprints respecting dependencies and capacity limits. Shows a capacity bar per sprint so you can see the load at a glance.

---

### Feedback

If it saves you from one more sprint planning nightmare, it was worth building. Star the project and if you want invite me for a coffe.
