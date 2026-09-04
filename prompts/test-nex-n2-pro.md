# Testing nex-agi/nex-n2-pro with Cline

## System / Role Prompt

```
You are an expert software engineer and AI coding assistant working inside a VS Code workspace. You specialize in building clean, maintainable, and well-documented code. When asked to implement or refactor code:

1. First understand the existing project structure and conventions.
2. Make minimal, focused changes.
3. Explain your reasoning briefly before each significant change.
4. Use the project's existing patterns for imports, naming, and style.
5. After editing, suggest how to verify the change (tests, lint, build, or manual checks).
```

## Task Prompt Template

Use this template to test coding capabilities. Replace the placeholders before sending.

```
Project: d:\Users\User\Sonar\VIdeoArt
Task: <describe what you want, e.g., "Refactor the API usage tracking module to use a single source of truth">

Requirements:
- <requirement 1>
- <requirement 2>
- <requirement 3>

Constraints:
- Do not break existing functionality.
- Preserve the current file structure unless a move is strictly necessary.
- Follow existing naming conventions.

Verification:
- Run <your test/build command> to confirm the change works.
```

## Example Ready-to-Use Prompt

```
Project: d:\Users\User\Sonar\VIdeoArt
Task: Explore the api/ folder and explain what each module does, then suggest one concrete improvement for better maintainability.

Requirements:
- Read every file in the api/ directory.
- Summarize the responsibility of each module in one sentence.
- Identify one duplicated concern or potential bug.
- Propose a refactor with a short rationale.

Constraints:
- Do not modify files unless I explicitly ask.
- Keep the summary concise.
```

## Cline Test Prompt — nex-agi/nex-n2-pro:free

Copy and paste this directly into the Cline chat panel to verify the model is responding and using tools correctly:

```
Project: d:\Users\User\Sonar\VIdeoArt
Model: nex-agi/nex-n2-pro:free

Task: Explore the api/ folder and give me a concise summary of what each module does. Do not edit any files.

Steps:
1. List all files in d:\Users\User\Sonar\VIdeoArt\api\.
2. Read each file briefly.
3. Summarize the purpose of each module in one sentence.
4. Identify one potential improvement or issue.
5. Report back without making changes.

Constraints:
- Do not write, modify, or delete files.
- Keep the final summary under 300 words.
```

## Real Task for VIdeoArt Project — Brain Memory Sync

This task uses a real inconsistency in the project to test Cline + `nex-agi/nex-n2-pro:free`.

```
Project: d:\Users\User\Sonar\VIdeoArt
Model: nex-agi/nex-n2-pro:free

Task: Fix the inconsistency between client-side and server-side brain memory storage limits.

Background:
- src/brainMemory.js uses MAX_PER_MOVIE = 120
- api/brain-memory.js uses MAX_PER_MOVIE = 100

This mismatch means the client may keep 120 memories locally, but the server only stores 100 remotely, which can silently drop data during cloud sync.

Requirements:
1. Read both files and confirm the mismatch.
2. Decide whether 120 or 100 is the correct limit (prefer the server's current behavior unless there's a reason not to).
3. Update one file so both limits match.
4. If MAX_PER_MOVIE is referenced anywhere else in the project, check those references too.
5. Do not change any other behavior.

Verification:
- After editing, confirm both files show the same MAX_PER_MOVIE value.
- If the project has lint or build commands, suggest which one to run.

Constraints:
- Do not refactor unrelated code.
- Keep changes minimal and focused.
```

## Tips for Best Results

- Be specific about the scope (file, folder, or feature).
- Include "do not X" constraints when needed.
- Ask for a plan before execution on large refactors.
- Request verification steps after code changes.
- If the model has tool access, instruct it to use read_file / replace_string_in_file / run_in_terminal.
