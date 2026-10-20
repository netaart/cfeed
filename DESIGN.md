# cfeed Design

cfeed is an **anonymous**, general-purpose feedback service on Cloudflare Workers, built with Hono, D1, and R2.

- **Writes are fully open**: anyone can submit. No key, no prior registration.
- **Reads require a key**: keys are issued and revoked in the admin console, and can be scoped to one app or all apps.

## 1. Concepts

| Concept | Description |
|---|---|
| **app** | A plain string (e.g. `memos-desktop`) that groups feedback. It is not a credential. Defaults to `default`; unregistered apps are accepted as-is |
| **App config** (optional) | Registered per app in the console: source domain allowlist, attachment limits, enable/disable. Apps without a config use global defaults |
| **API key** `ck_…` | **Only for reading and triaging feedback.** Issued in the console with two attributes: `app` (NULL = all apps) and `scope` (`read` or `write`). Only the hash is stored; the plaintext is shown once |
| **ADMIN_TOKEN** | Worker secret with full privileges; used to sign in to the console and issue keys |

## 2. Architecture

```
Anyone ──POST /api/v1/feedback (app=xxx)──▶ Worker (Hono)
                                           ├─ RateLimit(ip_hash)
                                           ├─ R2 put attachments
                                           └─ D1 batch insert
Scripts / backends ──Bearer ck_… | ADMIN_TOKEN──▶ /api/v1/*      query / triage / download
Admin browser ──cookie──▶ /dashboard/  (React + HeroUI SPA, served by Workers Static Assets)
                        └──▶ /api/admin/*  login, key issuance, app config
```

The SPA is built into `dashboard/` (`dashboard/index.html`, assets under `dashboard/assets/`), so Static Assets only matches `/dashboard/…` and `/favicon.ico`. Everything else, including `/`, reaches the Worker: `/` returns a small JSON pointer to the repository and unknown paths return a JSON 404, so the console is not exposed at the root. `assets.run_worker_first: ["/api/*"]` keeps API requests off the asset lookup.

Layout:

```
src/worker/
  index.ts               # route mounting, `/` info, `/skill.md`, uniform error format
  routes/submit.ts       # POST /api/v1/feedback (anonymous)
  routes/query.ts        # /api/v1/feedback*, /attachments/:id, /stats, /apps
  routes/admin.ts        # /api/admin/login|logout|me|keys*|apps*
  lib/auth.ts            # ck_ / ADMIN_TOKEN / signed cookie → Auth
  lib/context.ts         # UA, client hints, cf geo data, ip_hash
  lib/ua.ts              # minimal UA parser (no dependency)
  lib/extra.ts           # extra parsing/size limit and flattening into feedback_extra
  lib/config.ts          # app config merged with global defaults
  lib/id.ts              # ULID, key generation, sha256 / hmac / constant-time compare
src/web/                 # admin SPA: React 19 + HeroUI v3 + Tailwind v4, Chinese/English UI
dashboard/index.html     # SPA entry, served at /dashboard/
skills/cfeed/SKILL.md    # Agent Skill for the read/triage API (npx skills add, /skill.md)
migrations/0001_init.sql
```

## 3. Data model

See [`migrations/0001_init.sql`](migrations/0001_init.sql) for the full schema.

| Table | Purpose |
|---|---|
| `apps` | Optional per-app config, keyed by `slug` |
| `feedback_extra` | Inverted index over `extra` for `x.<path>` filters (see 3.1) |
| `api_keys` | Read/write keys |
| `feedback` | Feedback rows. `app` is plain text with **no foreign key**, so unregistered apps can write |
| `attachments` | Attachment metadata, cascade-deleted with its feedback |

Notes:

- All primary keys are **ULIDs**: time-ordered and convenient for cursor pagination.
- `feedback` columns fall into three groups:
  1. **Client-writable**: `app content extra`. cfeed defines no other app-level fields: type/category, contact, user id, rating, app version, page URL and the like belong in `extra`, shaped however each app wants.
  2. **Server-captured**: `ua* client_hints ip_hash country region city timezone asn colo language referer origin`. Same-named fields sent by the client are ignored.
  3. **Triage**: `status tags note`, writable only with a `write` key or ADMIN_TOKEN. `status` is `open` (unmarked, the default), `resolved`, or `spam`; the console shows only the two marks.
- Raw IPs are never stored, only `HMAC-SHA256(IP_SALT, ip)`. It is used for rate limiting and to spot repeated submissions from the same client.
- Every index starts with `app`.

### 3.1 Custom fields: `extra`

`extra` is free-form: any JSON object is stored as-is, with no schema, no per-app declarations, and no type checks. The only limit is `MAX_EXTRA_BYTES` (16 KB) serialized.

To make `x.<path>` filters fast for arbitrary keys, every submission is also flattened into `feedback_extra (path, value, feedback_id)`, primary key `(path, value, feedback_id)`, written in the same `DB.batch` as the feedback row and cascade-deleted with it:

- One row per scalar leaf; `value` is the leaf's JSON text (`"1.4.2"`, `3`, `true`, `null`).
- Paths are dot-joined keys matching `[A-Za-z0-9_]+`, at most 5 segments. Other keys are skipped.
- Scalar array elements share their parent's path, so `x.tags=ui` means "tags contains ui". Objects or arrays nested inside arrays are not indexed.
- Values longer than 256 characters and anything past 256 leaves per submission are not indexed (still stored in `extra`, just not filterable).

```json
{ "version": "1.4.2", "tags": ["sync", "ui"], "device": { "model": "Pixel 8" } }
```
→ `(version, "1.4.2")`, `(tags, "sync")`, `(tags, "ui")`, `(device.model, "Pixel 8")`.

Migration `0003` backfills the table from existing rows with the same rules. Migrations `0005` and `0006` moved the former `contact / user_id / rating / app_version / page_url / type` columns into `extra` (and the index) and dropped them; `type = 'other'` was the implicit default and was not carried over.

## 4. API

Errors always use `{"error": {"code": "…", "message": "…"}}` with a matching HTTP status.

### 4.1 Submit (anonymous): `POST /api/v1/feedback`

CORS is open to every origin (`Access-Control-Allow-Origin: *`, no credentials), so browsers can call the JSON endpoint directly.

Both **multipart** (with attachments) and **JSON** (no attachments) are accepted:

| Field | Required | Notes |
|---|---|---|
| `content` | ✅ | At most `MAX_CONTENT_CHARS` |
| `app` | | Must match `^[a-z0-9][a-z0-9_-]{0,63}$`; defaults to `default`. May also be passed as `?app=` |
| `extra` | | Any JSON object (JSON string in multipart, object in JSON). All app-specific data goes here |
| `files` | | Multipart only, repeatable |
| `website` | | Honeypot; if non-empty the submission is silently dropped with a 201 |

Any other top-level field is rejected with `400 unknown_field` and a hint to move it into `extra`, so misplaced data fails loudly instead of being dropped.

```bash
# Minimal
curl -X POST https://cfeed.example.workers.dev/api/v1/feedback \
  -H 'content-type: application/json' -d '{"content":"Love it"}'

# With app, custom fields, and an attachment
curl -X POST https://cfeed.example.workers.dev/api/v1/feedback \
  -F app=memos-desktop -F content='Save button does nothing' \
  -F extra='{"type":"bug","app_version":"1.4.2","user_id":"u_42","contact":"a@b.c"}' -F files=@screenshot.png
```

Response `201`:

```json
{ "id": "01JAB…", "app": "memos-desktop", "created_at": 1760860800000,
  "attachments": [{ "id": "01JAC…", "filename": "screenshot.png", "size": 48213 }] }
```

Processing:

1. Rate-limit by IP hash with `SUBMIT_LIMITER` **before reading the body**, so abusive clients cannot make the Worker buffer large uploads. Over the limit → `429`.
2. Parse the body and resolve `app` (default `default`). Load its config, falling back to global defaults. A `disabled` app → `403`; this is how a spammed app is shut off.
3. If the app has `allowed_domains` and the request carries an `Origin` header, the Origin's hostname must match an entry: `neta.art` matches exactly that host (any scheme or port), `*.neta.art` matches subdomains only (not `neta.art` itself). Otherwise `403 origin_not_allowed`. Requests without `Origin` (servers, native clients, CLI) are not checked. This only stops other websites from submitting through a visitor's browser; it is not authentication, since non-browser clients can send any Origin.
4. Validate fields, the size of `extra`, and attachments (count, size, MIME).
5. Write attachments to R2 **in parallel** under `{app}/{feedback_id}/{attachment_id}`. The user-supplied filename is **never** part of the key. R2 failure → `502`.
6. Insert the feedback, its `feedback_extra` rows, and attachments in one transaction with `DB.batch([...])`.
7. If step 6 fails, delete the R2 objects from step 5 and return `500`.

### 4.2 Query (`Authorization: Bearer ck_… | ADMIN_TOKEN`, or the console cookie)

A key scoped to one app is **forced** into that app; requesting any other `app` returns `403`.

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/api/v1/feedback` | read | List |
| GET | `/api/v1/feedback/:id` | read | Detail, including attachments |
| GET | `/api/v1/attachments/:id` | read | Stream an attachment from R2 |
| GET | `/api/v1/stats` | read | Counts by status, plus daily counts for the last 30 days |
| GET | `/api/v1/apps` | read | Apps seen so far, with feedback count, latest time, and whether a config exists |
| PATCH | `/api/v1/feedback/:id` | write | Update `status` (`open` / `resolved` / `spam`), `tags`, `note` |
| DELETE | `/api/v1/feedback/:id` | write | Delete, including its R2 attachments |

List filters:

| Parameter | Example | Notes |
|---|---|---|
| `app` | `app=memos-desktop,blog` | Comma-separated |
| `status` `country` `ua_os` `ua_device` | `status=open,resolved` | Comma-separated. `spam` is hidden unless `status` is given |
| `from` `to` | `2026-10-01` or a millisecond timestamp | Filters `created_at`; a date-only `to` is inclusive |
| `q` | `crash` | `LIKE` match on `content` |
| `x.<path>` | `x.version=1.4.2`, `x.device.model=iPhone15` | Filters on `extra` |
| `has_attachments` | `1` or `0` | |
| `limit` `cursor` | | Default 20, max 100. The cursor is base64 of the last row's `created_at:id` |

`x.<path>` safety: the path must match `^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,4}$`, with at most 5 such filters. Each filter becomes `id IN (SELECT feedback_id FROM feedback_extra WHERE path = ? AND value IN (?, …))`, served by the primary key; **both path and values are bound parameters**, never interpolated. Because values are stored as JSON text, candidates include both the string and the literal form: `x.n=3` matches `3` and `"3"`, `x.pro=true` matches `true` and `"true"`. Multiple filters are ANDed.

**Attachment download safety**: anything other than `image/png|jpeg|webp|gif` is served as `application/octet-stream` with `Content-Disposition: attachment`. Every response carries `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`. SVG and HTML are not in the default allowlist, and even when an app allows them (or any type, see below) they are only ever downloaded, so stored XSS cannot run on the console's origin.

### 4.3 Admin `/api/admin/*` (ADMIN_TOKEN only)

| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/login` | Body `{ token }`; sets a signed HttpOnly cookie (SameSite=Strict, 7 days). Rate-limited per IP |
| POST | `/api/admin/logout` | Clears the cookie |
| GET | `/api/admin/me` | Session check |

**Keys**

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/keys` | List `name / key_prefix / app / scope / last_used_at / revoked_at`; never the plaintext |
| POST | `/api/admin/keys` | Body `{ name, app?, scope? }`; **the plaintext `ck_…` is returned only here** |
| POST | `/api/admin/keys/:id/revoke` | Revoke; takes effect immediately |

**App configs**

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/apps` | Registered configs |
| PUT | `/api/admin/apps/:slug` | Create or replace: `name`, `allowed_domains` (hostnames or `*.host`; full URLs are reduced to their host, IDNs to punycode), `max_files`, `max_file_bytes`, `allowed_mime` (exact types, `image/*`-style wildcards, or `*/*` to accept any type without checking; `null` = global default), `status` |
| DELETE | `/api/admin/apps/:slug` | Remove the config only (defaults apply again); **feedback is kept** |

### 4.4 Agent skill `GET /skill.md`

`skills/cfeed/SKILL.md` is the single source: installable with `npx skills add netaart/cfeed`, and served verbatim (public, no auth) at `/skill.md`. It covers list/filter, detail, attachments, stats, apps, `PATCH` and `DELETE`, and reads two environment variables, `CFEED_BASE_URL` and `CFEED_KEY`. The console shows both next to every newly issued key. Keep it in sync when the query API changes.

Bulk-deleting an app's feedback is planned for P2 (`DELETE /api/admin/feedback?app=…`).

## 5. Admin console `/dashboard/`

A React SPA built with [HeroUI v3](https://heroui.com) (React Aria + Tailwind v4). The UI is available in Chinese and English and follows the system dark mode. It has no auth logic of its own and relies entirely on the cookie set by `/api/admin/login`, which is also why `<img src="/api/v1/attachments/…">` works without extra handling.

- Sign in with ADMIN_TOKEN.
- **Feedback** (`#feedback`): stat cards; filter by app / status / content / extra (`type=bug version=1.4.2`); cursor pagination; a detail view with content, attachment previews, extra, and request context, plus resolved/spam marks, tags, note, and delete.
- **Apps** (`#apps`): every app seen with counts; create or edit configs (source domain allowlist, attachment limits, enable/disable); integration examples.
- **API Keys** (`#keys`): issue (app scope and read/write; plaintext shown once) and revoke.

For stronger protection, put Cloudflare Access in front of the Worker domain (no code changes).

## 6. Request context (`lib/context.ts`)

| Column | Source |
|---|---|
| `ua` | `User-Agent` |
| `client_hints` | `Sec-CH-UA`, `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform` |
| `ua_browser/os/device` | Regex parsing in `lib/ua.ts` (see below) |
| `country region city timezone asn colo` | `c.req.raw.cf` |
| `ip_hash` | HMAC of `CF-Connecting-IP` |
| `language referer origin` | The matching request headers |

`ua_device` is one of:

| Value | Meaning |
|---|---|
| `desktop` `mobile` `tablet` | Browsers, plus native apps whose OS is known: `okhttp/…` and `Dalvik/…` count as Android `mobile` |
| `bot` | Crawlers and headless browsers only (Googlebot, bingbot, Bytespider, Slackbot, HeadlessChrome, …) |
| `cli` | Scripts and HTTP tools: curl, wget, HTTPie, python-requests/httpx/aiohttp, Go, Node fetch, node-fetch, axios, Postman, Java |
| `unknown` | No UA, or a native client whose form factor can't be told: iOS/macOS `CFNetwork … Darwin/x` (OS recorded as `Darwin`), Flutter `Dart/x` |

When no known browser or tool matches, a leading `Name/version` product token is used as the client (`ua_browser`). Apps that want accurate context can therefore send their own UA, e.g. `CohubMobile/1.2.3 (Android 14; Pixel 8)` or `CohubMobile/1.2.3 (iPhone; iOS 18.0)`, which parses to `CohubMobile 1.2`, Android 14 / iOS 18.0, `mobile`.

Why not `ua-parser-js`: only coarse classification is needed, which takes about 80 lines of regex. The raw UA is stored, so rows can be re-parsed whenever the rules change.

When feedback is relayed through an integrator's **backend**, the captured UA is the relay's. In that case the client's real UA should go into `extra.client_ua`.

## 7. Abuse prevention (fully anonymous)

1. Per-IP Rate Limiting binding (default 10 per 60 s).
2. Mark a spammed app as `disabled`.
3. Optional `allowed_domains` (only for apps with a config; browser submissions only).
4. Honeypot field `website`.
5. Hard limits on content length, extra size, attachment count, size, and MIME.
6. Admins can mark feedback as `spam`; it is hidden by default.
7. (P2) Optional Turnstile.

Known tradeoff: anyone can write under any app name, including made-up ones. That is inherent to an anonymous service; rate limiting, `disabled`, and spam marking are the backstops.

## 8. Limits and tradeoffs

- Workers request bodies are capped at 100 MB (Free/Pro), and `formData()` buffers the whole request in memory (128 MB limit), so the defaults are 10 MB per file and 5 files. Large uploads would need presigned R2 uploads.
- A D1 database is limited to 10 GB, and a row to 2 MB. Attachments live in R2.
- `q` is a `LIKE` scan bounded by the `app` index. Switch to FTS5 if volume grows.
- `last_used_at` is updated asynchronously via `ctx.waitUntil`, at most once per hour per key, so reads do not each cost a D1 write.
- The Rate Limiting binding counts per Cloudflare location and is approximate.

## 9. Phases

| Phase | Scope |
|---|---|
| **P0** | Anonymous submit, query API, key issuance/revocation, app configs, request context, rate limiting |
| **P1** | Admin console, `/api/v1/stats` (shipped together with P0) |
| **P2** | Bulk delete per app, CSV/NDJSON export, new-feedback webhooks, Turnstile, FTS5 |

## 10. Local development and deployment

```bash
cp .dev.vars.example .dev.vars        # ADMIN_TOKEN=… IP_SALT=…
npm run db:migrate
npm run dev                           # console at http://localhost:5173/dashboard/
npm run typecheck
```

Production (`cfeed.neta.art`, Workers Custom Domain) is deployed by Cloudflare Workers Builds on push to `main`, with build command `npm run build` and deploy command `npx wrangler d1 migrations apply cfeed --remote && npx wrangler deploy`, so new migrations ship with the code. D1 and R2 live in APAC. `ADMIN_TOKEN` and `IP_SALT` are Worker secrets set via `wrangler secret put`.
