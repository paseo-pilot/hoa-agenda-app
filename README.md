# HOA Agenda App

SQLite-backed HOA agenda tracker with a Linear-inspired dark UI, built for local hosting over Tailscale and future SharePoint/MS Graph document integration.

## Planned stack

- React + Vite frontend
- Node + Express backend
- SQLite via better-sqlite3
- SharePoint/MS Graph document integration (next phase)
- Tailscale Serve for secure tailnet access

## Current status

This is the first real scaffold after the static prototype. It includes:
- SQLite schema for meetings, agenda items, documents, item_documents, and item_history
- automatic seed import from `../data/hoa-agenda/items.json`
- dark, modern, Linear-style UI shell
- read APIs for meetings/items/documents
- create/update item endpoints and document-link endpoint

## Run locally

```bash
cd hoa-agenda-app
npm install
npm run dev
```

Server: `http://127.0.0.1:8090`
Client: `http://127.0.0.1:8091`

## Next steps

1. Add interactive editing in the UI
2. Add SharePoint/MS Graph document upload + metadata sync
3. Add Tailscale-served production path for the new app
4. Publish repo and invite Dan as collaborator
