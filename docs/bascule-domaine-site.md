# Mettre le site sur inside-odc.com

*Bascule de `inside-odc.vercel.app` vers le domaine du centre. Comptez une demi-heure, plus le temps de propagation DNS.*

---

## L'ordre compte

Une bascule de domaine se fait dans un sens précis. Inversé, elle coupe le site :

1. Brancher le domaine sur Vercel, et vérifier qu'il sert bien le site.
2. Autoriser le nouveau domaine côté API, sans quoi plus aucune donnée ne se charge.
3. Seulement ensuite, rediriger l'ancienne adresse vers la nouvelle.

Rediriger avant que le nouveau domaine ne fonctionne rend le site inaccessible par les deux adresses à la fois.

## Étape 1 — Déclarer le domaine dans Vercel

Projet → **Settings → Domains → Add**. Ajoutez `inside-odc.com`, puis `www.inside-odc.com`.

Vercel indique les enregistrements DNS à créer. **Lisez la mise en garde ci-dessous avant de les poser.**

## Étape 2 — Les enregistrements DNS, et le piège

⚠️ **Sur le domaine racine, utilisez un enregistrement A. Jamais un CNAME.**

Un CNAME à la racine est incompatible avec tout autre enregistrement portant le même nom. Or la racine de `inside-odc.com` porte déjà :

- les **MX** de votre messagerie OVH ;
- le **TXT** `brevo-code:` qui authentifie le domaine chez Brevo ;
- le **TXT** `v=spf1` de votre SPF.

Poser un CNAME à la racine ferait disparaître les trois d'un coup : plus de réception de courrier, et plus d'envoi de campagnes. Certains hébergeurs l'acceptent silencieusement ; le dégât ne se voit qu'après.

Dans la zone DNS OVH :

| Sous-domaine | Type | Valeur |
|---|---|---|
| *(vide)* | **A** | l'adresse IP indiquée par Vercel |
| `www` | **CNAME** | `cname.vercel-dns.com.` |

Un `www` en CNAME ne pose aucun problème : rien d'autre ne porte ce nom.

Supprimez au passage l'éventuel enregistrement A pointant vers la page de parking d'OVH — c'est lui qui s'afficherait sinon. Ne touchez à rien d'autre : ni MX, ni TXT, ni les CNAME `brevo1._domainkey` et `brevo2._domainkey`.

## Étape 3 — Vérifier avant d'aller plus loin

Vercel affiche une pastille verte sur le domaine quand il le voit correctement pointé, et émet le certificat TLS automatiquement.

Ouvrez `https://inside-odc.com` : la page d'accueil du centre doit s'afficher, en HTTPS, sans avertissement.

**Puis revérifiez la messagerie** — c'est le contrôle qui rattrape une erreur de zone DNS : page **Campagnes**, encart *Envoi d'emails*, bouton **Revérifier**. Les cinq contrôles doivent toujours être au vert. S'ils ne le sont plus, un enregistrement a été écrasé : restaurez-le avant de continuer.

## Étape 4 — Autoriser le domaine côté API

Sans cela, le site s'affiche mais aucune donnée ne se charge : le navigateur bloque les appels vers une API qui n'autorise pas l'origine.

Dans Railway, variables du service backend :

```
CORS_ORIGIN   = https://inside-odc.com,https://www.inside-odc.com,https://inside-odc.vercel.app
APP_BASE_URL  = https://inside-odc.com
```

Gardez l'ancienne adresse dans `CORS_ORIGIN` pendant la transition : elle sert encore tant que la redirection n'est pas en place, et les sessions ouvertes dessus continuent de fonctionner.

`APP_BASE_URL` détermine les liens envoyés par email — invitations, création de mot de passe. Les liens déjà partis vers l'ancienne adresse resteront valables : elle redirigera.

Attendez le redémarrage du service, puis rechargez le site et vérifiez qu'une page de données s'affiche.

## Étape 5 — Rediriger l'ancienne adresse

**Seulement une fois les quatre étapes précédentes vérifiées.**

La redirection vit dans `frontend/vercel.json` : toute requête arrivant sur `inside-odc.vercel.app` repart vers la même page sur `inside-odc.com`.

Elle est posée en **temporaire (307)** et non en permanente (308). C'est délibéré : une redirection permanente est mise en cache par les navigateurs pour très longtemps, et devient difficile à défaire si un problème apparaît. Une fois la bascule éprouvée — comptez une semaine — passez `"permanent": true`.

## Après la bascule

Ce qui continue de fonctionner sans rien faire :

- les liens déjà envoyés par email vers l'ancienne adresse, par la redirection ;
- les sessions ouvertes, le cookie étant posé par l'API et non par le site.

Ce qu'il reste à faire, quand vous le souhaitez :

- prévenir l'équipe de la nouvelle adresse ;
- réinstaller l'application sur les écrans d'accueil des téléphones qui l'utilisent en mode application : une PWA installée reste attachée au domaine depuis lequel elle a été installée.

Et un bénéfice inattendu : le blocage par certains antivirus, Avast notamment, visait le sous-domaine `vercel.app`. Un domaine propre le fait disparaître.
