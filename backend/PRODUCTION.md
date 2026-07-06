# Guide de deploiement — Inside ODC

## Stack recommandee

| Composant       | Service  | Cout      |
|-----------------|----------|-----------|
| Frontend        | Vercel   | Gratuit   |
| Backend         | Railway  | ~$5/mois  |
| Base de donnees | Neon     | Gratuit   |

---

## Etape 1 — Backend sur Railway

1. railway.app → New Project → Deploy from GitHub repo
2. Selectionner le repo `inside-odc`
3. Settings → Root Directory = `backend`
4. Railway detecte Node.js et lance `npm start` automatiquement

### Variables d'environnement a configurer sur Railway :

```
NODE_ENV=production
DATABASE_URL=<URL Neon complete>
JWT_SECRET=<chaine aleatoire longue et securisee>
JWT_COOKIE_SAMESITE=none
CORS_ORIGIN=https://ton-site.vercel.app
DB_SSL=true
ADMIN_PIN_HASH=<voir section PIN ci-dessous>
ANTHROPIC_API_KEY=<cle Anthropic>
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
AI_ENABLED=true
AI_MAX_TOKENS=1024
```

Railway fournit une URL du type : `https://inside-odc-xxx.up.railway.app`

---

## Etape 2 — Frontend sur Vercel

1. vercel.com → New Project → Import Git Repository → `inside-odc`
2. Root Directory = `frontend`
3. Framework Preset = Vite (auto-detecte)
4. Build Command = `npm run build`
5. Output Directory = `dist`

### Variable d'environnement a configurer sur Vercel :

```
VITE_API_URL=https://inside-odc-xxx.up.railway.app
```

Vercel fournit une URL du type : `https://inside-odc.vercel.app`

---

## Etape 3 — Mettre a jour CORS sur Railway

Une fois le frontend deploye sur Vercel, revenir sur Railway et mettre :
```
CORS_ORIGIN=https://inside-odc.vercel.app
```
Puis redeclencher le deploiement Railway (automatique apres changement de variable).

---

## Securiser le PIN admin

Generer un hash bcrypt du PIN (en local) :

```bash
cd backend
npm run hash-admin-pin -- TON_PIN
```

Dans Railway : ajouter `ADMIN_PIN_HASH=<hash>` et supprimer `ADMIN_PIN`.

---

## Verification post-deploiement

- [ ] `https://backend-url/healthz` repond `{ "status": "ok", "db": "up" }`
- [ ] Login fonctionne sur le frontend Vercel
- [ ] Code PIN fonctionne sur la page Dispositifs
- [ ] Import Excel fonctionne
- [ ] Assistant IA repond (si ANTHROPIC_API_KEY configuree)
- [ ] Page check-in publique accessible sans login : `/checkin/:id`

---

## Nettoyage des tokens expires

```bash
npm run cleanup-reset-tokens
```

A planifier en tache periodique (une fois par jour recommande).

## Notes securite

- Les cookies JWT utilisent `HttpOnly` — jamais exposés au JavaScript
- `SameSite=None; Secure` requis en production (frontend et backend sur domaines differents)
- Frontend et backend doivent etre en HTTPS (garanti par Vercel et Railway)
