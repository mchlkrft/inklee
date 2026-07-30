# Evidence directory

Supporting artifacts for findings in `../findings.yaml`, referenced from a
finding's `evidence.references` or `evidence.evidence_location`.

## This repository is PUBLIC

Everything committed here is world-readable. Before adding a file:

**Never commit**

- secrets, tokens, API keys, connection strings, service-role keys;
- customer, artist or client personal data, including email addresses;
- production row data, exports or dumps;
- complete, runnable exploit instructions against production.

**Prefer**

- a citation (`path/to/file.ts:120-134` at a named commit) over a copied block;
- catalog *shapes* (policy names, constraint names, column names) over row data;
- redacted command output, with the redaction marked as `[redacted]`;
- a synthetic reproduction over a real one.

If a finding needs evidence that cannot live here, set
`disclosure.public_repo_safe: false` on the finding and point
`disclosure.restricted_evidence_location` at where the full evidence is held.
Record that it exists; do not silently omit it.

## Naming

`<FINDING-ID>-<short-slug>.<ext>`, for example `AUTH-RLS-001-policy-catalog.md`.

Keep files small and text-based so they diff. A finding whose evidence is a
screenshot is usually a finding whose evidence has not been written down yet.
