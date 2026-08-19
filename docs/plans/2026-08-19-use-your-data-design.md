# Use Your Data — Design

## Objective

Help users understand how SolveStack exports can become durable organizational knowledge without suggesting that SolveStack uploads data, includes AI, or replaces an existing knowledge platform.

## Surfaces

SolveStack will provide two complementary surfaces:

1. A concise in-app guide available from primary navigation, Settings, and the session export area.
2. A public, indexable guide at `/use-your-data/` with practical workflows, format guidance, privacy guardrails, and reusable AI-review prompts.

The public guide remains broadly vendor-neutral. Products such as SharePoint, OneDrive, GitHub, enterprise search, and approved AI assistants may appear as examples rather than required destinations.

## Content model

The guide organizes possibilities by outcome:

- Build a searchable troubleshooting library.
- Review completed investigations with an approved AI tool.
- Create knowledge articles, runbooks, and training material.
- Identify recurring symptoms, root causes, and preventative actions.
- Share readable incident records.
- Preserve lossless backups and original evidence.

Each workflow identifies the best export format, a short process, an example, and relevant privacy considerations. Markdown is positioned as the primary knowledge-reuse format; HTML as the human-readable sharing format; JSON as the lossless import/automation format; and ZIP as the complete archival package.

## Guardrails

- SolveStack does not transmit exports or invoke external AI systems.
- Users should redact credentials, personal data, tenant details, and confidential evidence before external sharing.
- External tools have independent privacy, retention, and governance policies.
- Organization-approved storage and AI tools should be used for workplace data.
- AI prompts must instruct the model not to invent information missing from the record.

## Verification

- Public guide is crawlable, canonicalized, included in the sitemap, and usable without JavaScript.
- In-app guide is keyboard accessible and works at mobile widths.
- Export guidance does not block downloads.
- PWA caching includes the public guide.
- Automated contracts cover the route, sitemap, guide controls, and privacy language.
