# cfeed

Anonymous, general-purpose feedback service on Cloudflare Workers + D1 + R2, with a HeroUI admin console.

- **Anonymous submit**: `POST /api/v1/feedback` needs no key, has open CORS, and accepts optional attachments.
- **Server-side context**: parsed UA, client hints, country/city/timezone/ASN, language, referer, hashed IP.
- **Custom fields**: free-form `extra` JSON, no schema; every leaf is indexed so `x.<path>=value` filters stay fast.
- **Keyed reads**: `ck_…` keys issued in the console, scoped to one app or all, read or write.
- **Admin console**: HeroUI v3, Chinese and English UI, dark mode.
- **Agent skill**: `GET /skills.md` serves an [Agent Skill](src/worker/skill.md) for the read/triage API; hand an agent that URL plus a `ck_…` key.

See [DESIGN.md](DESIGN.md) for the full API and data model.

## Develop

```bash
npm install
cp .dev.vars.example .dev.vars   # ADMIN_TOKEN, IP_SALT
npm run db:migrate
npm run dev                      # console at http://localhost:5173/dashboard/
npm run typecheck
```

## Deploy

Deployed by Cloudflare Workers Builds on every push to `main`:

- Build command: `npm run build`
- Deploy command: `npx wrangler d1 migrations apply cfeed --remote && npx wrangler deploy`

D1 `cfeed` and R2 `cfeed-attachments` already exist (APAC), and their IDs are in `wrangler.jsonc`. Secrets are set once per Worker:

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put IP_SALT
```

## Submit

```bash
curl -X POST https://<your-worker>/api/v1/feedback \
  -F app=my-app -F type=bug -F content='Save button does nothing' \
  -F extra='{"version":"1.0.0"}' -F files=@screenshot.png
```
