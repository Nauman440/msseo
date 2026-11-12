# Code Style Rules

## General
- Match existing indentation and naming conventions in each file — don't reformat unrelated code.
- No commented-out dead code left in commits.
- No debug output (`console.log`, `var_dump`, `print_r`) left in committed code.
- Prefer clear names over comments explaining unclear names.

## PHP / WordPress
- Follow WordPress Coding Standards (tabs for indentation, snake_case for functions/hooks).
- Sanitize all input (`sanitize_text_field`, `esc_url`, etc.) and escape all output (`esc_html`, `esc_attr`).
- Prefix all custom functions/hooks/CPTs with a unique project prefix to avoid collisions.
- Never hardcode credentials, API keys, or DB info — use `wp-config.php` constants or env vars.

## JavaScript / Liquid
- 2-space indentation, semicolons, single quotes.
- No inline `<script>` blocks for anything beyond a few lines — use enqueued/external files.
- Shopify: never modify theme.liquid layout structure without checking impact on all templates.

## Commits
- Format: `[area] short description` (e.g. `[checkout] fix tax calc on bundle products`)
- One logical change per commit where practical.
