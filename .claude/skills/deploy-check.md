---
name: deploy-check
description: Run pre-deploy checklist for this project
---

Before deploying, verify:
1. All uncommitted changes are intentional (`git status`)
2. Build passes with no errors
3. No debug code, console.logs, or var_dumps left in
4. Environment-specific values (API keys, URLs) are correct for the target environment
5. Run the qa-reviewer agent on the changed files

Report a pass/fail summary for each item.
