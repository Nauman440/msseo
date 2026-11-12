# Frontend / React Rules

- Functional components with hooks only — no class components.
- Keep components under ~200 lines; split when they grow past that.
- Co-locate component-specific styles/tests next to the component file.
- Use existing design tokens/theme variables — don't hardcode colors, spacing, or font sizes.
- All interactive elements must be keyboard-accessible (no click-only divs for buttons/links).
- Data fetching: use the project's existing pattern (e.g. server components, SWR, React Query) — don't introduce a new fetching library without discussion.
- No `any` in TypeScript unless justified with a comment.
