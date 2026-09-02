# Agent Information — `skills/`

Agent Skills for operating this pipeline, following the open Agent Skills
specification: https://agentskills.io/specification

These are **portable and vendor-neutral**. A skill is a folder; copy it to any
skills-compatible agent and it works. Nothing in a skill may assume Claude Code.

## Local setup — link this folder for your agent to discover it

`skills/` is the canonical, committed location. Agents that look for skills in a
tool-specific directory need a link to it. The link is local and gitignored;
**never commit a copy of these folders anywhere else** — two copies drift, and
then nobody knows which one an agent actually loaded.

For Claude Code, from the repository root:

```bash
# Windows (Git Bash) — directory junction, no admin rights needed
mkdir -p .claude && cmd //c "mklink /J .claude\skills skills"

# macOS / Linux
mkdir -p .claude && ln -s ../skills .claude/skills
```

Verify: the skills appear in the agent's available-skills list. If they do not,
the link is missing or points at the wrong path.

## Format — enforced, not suggested

```
skills/<name>/
  SKILL.md          Required: YAML frontmatter + Markdown instructions
  references/       Optional: detail loaded on demand
  scripts/          Optional: executable helpers
  assets/           Optional: templates, data
```

Frontmatter fields and their constraints:

| Field | Required | Constraint |
|---|---|---|
| `name` | yes | 1–64 chars, lowercase `a-z0-9-`, no leading/trailing hyphen, no `--`, **must equal the folder name** |
| `description` | yes | 1–1024 chars, says what it does **and when to use it** |
| `license` | no | Licence name or bundled file |
| `compatibility` | no | ≤500 chars; only if there are real environment requirements |
| `metadata` | no | String→string map |
| `allowed-tools` | no | Space-separated, experimental |

Validate before committing:

```bash
skills-ref validate ./skills/<name>
```

## Writing rules

- **`description` is the whole discovery mechanism.** Only `name` and
  `description` are loaded at startup — the body is read once the agent decides
  the skill applies. A vague description means the skill never fires. Include
  the concrete keywords that appear in the tasks it serves.
- **Keep `SKILL.md` under 500 lines** (under ~5000 tokens). Push detail into
  `references/`, loaded on demand. Progressive disclosure only works if you
  actually leave something to disclose.
- **One level of references.** No chains of files pointing at files.
- **Relative paths** from the skill root: `references/REFERENCE.md`.
- **Procedural, not conceptual.** A skill says how to do the task and where the
  edges are. Architecture rationale belongs in an `AGENTS.md`.

## Skills vs AGENTS.md — do not blur these

| | Loaded | Holds |
|---|---|---|
| `AGENTS.md` | Always, nearest file wins | Where you are, what the rules are here |
| Skill | On demand, when the task matches | How to perform a specific task |

Duplicating rules across both means they drift, and then nobody knows which is
current. State a rule once, in the layer that owns it, and reference it from the
other.
