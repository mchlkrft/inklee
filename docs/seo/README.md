# Inklee SEO operating system

This folder is the shared SEO operating system for Inklee. It is designed so that both **ChatGPT** (strategy) and **Claude Code** (implementation) work from the same version-controlled state through the GitHub repository.

## Source of truth

`docs/seo/inklee-seo-strategy.md` is the canonical SEO strategy for Inklee.

Temporary keyword exports, raw competitor notes, and tool exports must **not** become the canonical strategy. They can inform it, but only the canonical file above is authoritative.

## Responsibilities

### ChatGPT

Responsible for:

- Keywords
- Search intent
- Competitor analysis
- SEO strategy
- Keyword ownership
- Page architecture
- Prioritization
- Cannibalization rules
- Strategic content briefs

### Claude Code

Responsible for:

- Implementation
- Technical SEO
- Metadata
- Routes
- Redirects
- Sitemap
- Canonicals
- Structured data
- Internal linking
- Testing
- Performance
- Hands-on optimization

## Required workflow

Before Claude performs SEO-related implementation:

1. Read `docs/seo/inklee-seo-strategy.md`.
2. Inspect the current implementation.
3. Confirm which URL owns the search intent.
4. Avoid creating duplicate indexable pages.
5. Implement the smallest coherent change.
6. Test the result.
7. Add the completed work to `seo-implementation-log.md`.

## Strategic change rule

Claude must **not** silently change:

- Primary keywords
- Keyword ownership
- Canonical URLs
- Positioning
- Page hierarchy
- Target audience
- Cannibalization rules

When Claude finds a reason to challenge the strategy, add a clearly labeled proposal under the `## Proposed strategic changes` section of `inklee-seo-strategy.md`.

The proposal must contain:

- Current decision
- Proposed decision
- Technical or data-based reason
- Pages affected
- Cannibalization risk
- Recommended next step

Do not treat a proposal as approved strategy until the canonical strategy is updated.

## Files in this folder

| File | Purpose | Owner |
| --- | --- | --- |
| `inklee-seo-strategy.md` | Canonical strategy: keywords, ownership, architecture, cannibalization rules, priority | ChatGPT |
| `seo-implementation-log.md` | Record of completed technical/content implementation | Claude Code |
| `README.md` | This operating model | Shared |

## Related documents

- `docs/seo-strategy.md` — the analytical companion (audit, Reddit research, A/B strategy, scoring, measurement framework, validation backlog). Superseded as *canonical* by `inklee-seo-strategy.md`, but still the reference for the deeper analysis and the measurement/validation frameworks.
- `docs/roadmap.md` — product roadmap (SEO sections should point at the canonical strategy).
- `docs/business-model.md`, `docs/inklee-feature-scope.md` — product truth; SEO copy must not contradict these.
- `AGENTS.md` — copy rules (sentence case, no em-dashes, Accept/Pass verbs).
- `docs/github-publishing-strategy.md` — governs the public GitHub repos; keeps them tool-neutral and off the commercial queries.
