---
name: commit-push
description: Commit and push new changes to the current branch after a coding session. Use when writing the commit message, or when the user says "commit", "push", or "ship it".
---

# Commit and Push

After a coding session, commit the new changes and push them to the current branch.

## Steps

1. Run `git status` and `git diff` to see what changed.
2. Group the changes into distinct user-facing improvements (usually 2-4).
3. Write the commit message using the format below.
4. Stage everything with `git add -A`, then commit with the message.
5. Push to the current branch with `git push`. If there is no upstream yet, use `git push -u origin <branch>`.
6. Never force push. If the push is rejected, stop and tell the user.

## Commit message format

Write the message like product release notes, not a developer changelog. Each change gets:

- **A short headline**: 2-4 words, ending in a period.
- **A description**: one or two short sentences about what the user gains, in plain language. Start with the benefit, not the implementation.

Separate each change with a blank line. Don't mention file names, function names, or technical jargon.

### Example (3 changes)

Smarter searches.
Get information the way you want to. Search text, images, videos, or news articles.

Easy to use.
Use tabs, autocomplete, a search bar, and bookmarks to easily navigate the web.

Make it custom.
It's easy to set your browsing preferences and colors.

## Rules

- One headline + description per change. Don't pad with extra changes to fill space.
- If there are only 1 or 2 bigger changes, write just 1 or 2 release notes. Don't force three. Less is usually more.
- Keep the tone friendly, confident, and active.
- If the changes are purely internal (refactors, dependency bumps), describe the benefit plainly, such as "Faster and more reliable." rather than the technical detail.