# Production Runbook

## 1) Required environment

Set at least:

- `NODE_ENV=production`
- `DATABASE_URL=...`
- `JWT_SECRET=...`
- `CORS_ORIGIN=https://your-frontend-domain`

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
