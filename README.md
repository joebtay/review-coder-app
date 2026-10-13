# Review Coder

Static web app for evidence reviews: code and verify documents, screen full texts, report agreement. No server. Each review's data lives in its own private GitHub repository, and each coder signs in with a personal GitHub token (fine-grained, or classic for a repo on another person's account).

This repository holds the built app and an invented demo project only. It holds no review data.

Built from the private source repository at commit ee0e768.

## Publishing rule (PI, 13 October 2026)

- This site serves the existing projects (the grey literature review and the cognitive impairment review). The generic platform must not affect them in any way.
- It publishes only from the source repository's `projects-stable` branch. Fixes for the existing projects go there, and only when the PI asks.
- The source repository's `main` (the generic platform) is never published here. It goes to a separate development site with made-up demo data only.
