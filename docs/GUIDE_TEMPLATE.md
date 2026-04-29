# `.runsight` Guide File — Template & Prompt

## What is it?

A `.runsight` file tells the RunSight agent how to navigate your project. Drop it in your project root and the agent will follow your instructions instead of guessing.

## Quick Start

Copy the prompt below into your AI tool (Kiro CLI, Claude, Cursor, ChatGPT) while in your project directory:

---

### Prompt to generate `.runsight`

```
Analyze this project and create a .runsight file for the RunSight autonomous browser agent.

The .runsight file tells the agent how to navigate and explore this web app. Read the project source code, README, and any config files to understand the UI.

Generate the file with these sections:

## Pages
List every page/route and what loads there. Include the URL path.

## Important flows
Number the key user flows in order. Example:
1. Click "Login" → fill email → fill password → click "Submit" → lands on /dashboard
2. Click "Settings" → toggle dark mode → click "Save"

## Keyboard actions
If the app uses keyboard input (games, shortcuts, editors), list them:
- Press ArrowUp — description
- Press Space — description
Only include this section if keyboard input is relevant.

## Skip these
List elements the agent should ignore (decorative buttons, sliders that don't navigate, canvas elements, etc.)

Rules:
- Use exact button/link text as it appears in the UI (in quotes)
- Be specific about element types (button, link, input)
- Order flows by importance
- Keep it concise — the agent reads this on every step

Save the output as .runsight in the project root.
```

---

## Example Output

```markdown
# Navigation Guide

## Pages
- / — Landing page with hero and "Get Started" button
- /login — Email + password form
- /dashboard — Main app view with sidebar navigation
- /settings — User preferences and account settings

## Important flows
1. Click "Get Started" → navigated to /login
2. Fill email input → fill password input → click "Sign In" → navigated to /dashboard
3. Click "Settings" in sidebar → click "Dark Mode" toggle → click "Save Changes"
4. Click "Logout" → navigated to /

## Keyboard actions
- Press Escape — close modals
- Press / — focus search bar

## Skip these
- Cookie consent banner — auto-dismisses
- Newsletter popup — not part of core flow
- Social media share buttons — external links
```

## File Naming

The agent looks for these filenames (in order):
1. `.runsight`
2. `.runsight.md`
3. `RUNSIGHT.md`
