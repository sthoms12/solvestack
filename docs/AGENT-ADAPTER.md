# SolveStack agent adapter

SolveStack does not host a model. The agent adapter is a **bring-your-own** protocol:

1. Capture the investigation locally.
2. Export **Agent pack** from the session toolbar.
3. Review the redacted ZIP, then open it in an organization-approved tool.
4. Optionally inspect the ZIP with `bun scripts/agent-pack-inspect.mjs path/to/pack.zip`.

Public guide: `/agent-adapter/`.
