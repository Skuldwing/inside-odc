# Production Runbook

## 1) Required environment

Set at least:

- `NODE_ENV=production`
- `DATABASE_URL=...`
- `JWT_SECRET=...`
- `CORS_ORIGIN=https://your-frontend-domain`
- `DB_SSL=true`
- `JWT_COOKIE_SAMESITE=none` (if frontend/backend are on different domains)
- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=gpt-4.1-mini`
- `AI_ENABLED=true`

## 2) Secure admin PIN

Generate a bcrypt hash:

```bash
npm run hash-admin-pin -- 2468
```

Then set in backend env:

- `ADMIN_PIN_HASH=<generated-hash>`
- remove `ADMIN_PIN`

## 3) Token cleanup job

Run manual cleanup:

```bash
npm run cleanup-reset-tokens
```

Schedule this command in cron (recommended every day).

## 4) Session model

- Auth now uses an `HttpOnly` cookie (`token`) instead of storing JWT in browser `localStorage`.
- Frontend and backend must be on HTTPS in production for secure cookies.
