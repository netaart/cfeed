---
name: cfeed
description: Read and triage feedback in cfeed via its HTTP API. Use when asked to list, search, or filter feedback, inspect an item or its attachments, mark it resolved or spam, tag or annotate it, or delete it.
---

# cfeed

Base URL: `{{BASE_URL}}`. Send `Authorization: Bearer $CFEED_KEY` on every call below (a `ck_…` key from the user). A key may be pinned to one app and may be read-only: `401` means a bad key, `403 forbidden` means outside the key's app or scope. Errors are `{"error":{"code","message"}}`; the message says what to fix.

## Read

`GET /api/v1/feedback` lists newest first and returns `{items, next_cursor}`. Repeat with `cursor=<next_cursor>` until it is `null`.

| Param | Meaning |
|---|---|
| `app` | App names, comma-separated |
| `status` | `open` (unmarked), `resolved`, `spam`, comma-separated. Omitted = everything except `spam` |
| `q` | Substring of `content` |
| `x.<path>=<value>` | Match the app's own `extra` JSON, e.g. `x.type=bug`, `x.device.model=Pixel%208`. Arrays match by contains. Up to 5, ANDed |
| `from`, `to` | `YYYY-MM-DD` or ms timestamp; a `to` date is inclusive |
| `country`, `ua_os`, `ua_device` | Request context; `ua_device` is `desktop`, `mobile`, `tablet`, `bot`, `cli`, or `unknown` |
| `has_attachments` | `1` or `0` |
| `limit` | Default 20, max 100 |

Each item: `id`, `app`, `content`, `extra` (app-defined JSON), `status`, `tags`, `note`, `created_at` (ms), `attachment_count`, plus server-captured context: `ua`, `ua_browser`, `ua_os`, `ua_device`, `country`, `region`, `city`, `timezone`, `language`, `referer`, `origin`, `ip_hash`.

| Call | Returns |
|---|---|
| `GET /api/v1/feedback/{id}` | The item plus `attachments: [{id, filename, content_type, size, url}]` |
| `GET /api/v1/attachments/{id}` | The file bytes |
| `GET /api/v1/stats?app=` | `{total, by_status, daily: [{date, count}]}` for the last 30 days |
| `GET /api/v1/apps` | `{items: [{app, name, count, last_at, registered, status}]}` |

## Triage (write key)

`PATCH /api/v1/feedback/{id}` with a JSON body holding any of these; returns the updated item:

- `status`: `"resolved"`, `"spam"`, or `"open"` (clears the mark)
- `tags`: string array that replaces the current tags (max 20, each at most 32 chars)
- `note`: internal note string, or `null` to clear (max 5000 chars)

`DELETE /api/v1/feedback/{id}` returns `204` and removes the item and its attachments permanently. Confirm with the user before deleting.

## Examples

```bash
curl -s -H "Authorization: Bearer $CFEED_KEY" "{{BASE_URL}}/api/v1/feedback?app=memos&x.type=bug&limit=50"

curl -s -X PATCH -H "Authorization: Bearer $CFEED_KEY" -H 'content-type: application/json' \
  -d '{"status":"resolved","tags":["sync"],"note":"fixed in 1.4.3"}' \
  "{{BASE_URL}}/api/v1/feedback/<id>"
```

Submitting needs no key: `POST /api/v1/feedback` with JSON `{"app","content","extra"}`.
