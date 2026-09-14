# Mettre en place un domaine d'envoi avec Brevo

*Marche à suivre complète, sans dépendre de la DSI Sonatel. Comptez une heure de manipulation, plus quelques heures d'attente pour la propagation DNS.*

---

## Pourquoi cette voie

Deux obstacles bloquaient les envois, et celui-ci les lève tous les deux d'un coup.

**Le port SMTP est fermé.** L'hébergeur bloque le trafic sortant sur le port 587 : la plateforme ne peut ouvrir aucune connexion vers `smtp.office365.com`. Brevo, lui, reçoit les messages par son API en HTTPS sur le port 443 — celui du web, jamais bloqué.

**Le domaine d'expédition n'est pas authentifié.** Depuis février 2024, Gmail, Yahoo et Microsoft refusent les messages dont le domaine ne publie pas SPF, DKIM et DMARC. `orangedigitalcenter.sn` n'en publie aucun, et sa zone DNS est tenue par la DSI. Sur un domaine qui vous appartient, vous posez ces enregistrements vous-même, en dix minutes.

## Étape 1 — Acheter un domaine

Chez n'importe quel bureau d'enregistrement : OVH, Gandi, Namecheap, Hostinger. Comptez 10 à 20 € par an pour un `.com`, davantage pour un `.sn`.

**Sur le choix du nom**, une précaution qui vous revient : évitez d'y faire figurer « orange ». C'est une marque déposée, et un domaine qui l'utilise sans accord écrit peut vous être réclamé. `insideodc.com`, `odc-senegal.com`, `digitalcenter-dakar.com` disent la même chose sans ce risque. Si vous tenez à un nom contenant la marque, demandez l'accord du service juridique de Sonatel avant d'acheter.

Une fois le domaine acheté, vous avez accès à sa **zone DNS** dans l'interface de l'hébergeur. C'est là que se posent les quatre enregistrements ci-dessous.

## Étape 2 — Déclarer le domaine chez Brevo

1. Connectez-vous à Brevo.
2. **Expéditeurs, domaines & IP dédiées** → onglet **Domaines** → **Ajouter un domaine**.
3. Saisissez votre domaine, puis choisissez **Authentifier ce domaine**.

Brevo affiche alors les enregistrements à créer. **Gardez cette page ouverte** : deux valeurs n'existent que là — la clé DKIM et le code de vérification.

## Étape 2 bis — Chez OVH, dans l'ordre

Le domaine du centre est enregistré chez OVH, avec la boîte Zimbra Starter offerte. Trois précisions propres à cette interface.

### Activez la boîte avant de toucher au DNS

*Espace client → Web Cloud → E-mails* (ou *Zimbra* selon la version de l'interface). Créez `contact@votredomaine.com` — une adresse au nom du centre, pas au nom d'une personne : elle doit survivre à un changement de poste.

Faites-le **avant** d'ajouter les enregistrements Brevo. En activant la messagerie, OVH pose ses propres MX et, surtout, **son propre SPF** (`v=spf1 include:mx.ovh.com ~all`). Il faut le voir avant d'écrire le vôtre, sinon on se retrouve avec deux SPF — et deux SPF s'annulent.

Ajoutez ensuite une **redirection** de cette boîte vers l'adresse professionnelle qui la relève réellement. Sans cela, c'est une seconde boîte à consulter, et personne ne la consultera.

### Le champ « Sous-domaine » est relatif

*Web Cloud → Noms de domaine → votre domaine → onglet **Zone DNS** → **Ajouter une entrée** → **TXT***.

OVH ne demande pas le nom complet : il demande la partie **devant** le domaine, qu'il complète lui-même. Saisir le nom entier produirait `brevo._domainkey.votredomaine.com.votredomaine.com`.

| Enregistrement | Ce qu'on saisit dans « Sous-domaine » |
|---|---|
| SPF | *laisser vide* |
| Code de vérification Brevo | *laisser vide* |
| DKIM | `brevo._domainkey` |
| DMARC | `_dmarc` |

N'encadrez pas les valeurs de guillemets : OVH les ajoute.

### Le SPF se modifie, il ne se duplique pas

Celui d'OVH existe déjà. Ouvrez-le et remplacez sa valeur par la version fusionnée :

```
v=spf1 include:mx.ovh.com include:spf.brevo.com ~all
```

Le panneau *Envoi d'emails* de la plateforme détecte le SPF en place et affiche directement cette fusion, avec un bouton pour la copier. Ne créez pas de seconde entrée SPF.

### Envoyer depuis le domaine racine

Ce guide-ci concerne un domaine dédié à la plateforme : `contact@votredomaine.com` convient très bien, et c'est le plus simple.

La recommandation d'un sous-domaine dédié, faite dans `demande-dns-delivrabilite.md`, visait un autre cas : y isoler la réputation des envois en nombre pour ne pas exposer la messagerie d'entreprise de Sonatel. Ici le domaine ne sert qu'à cela — la précaution est sans objet.

## Étape 3 — Poser les enregistrements DNS

Dans la zone DNS de votre domaine, créez quatre enregistrements de type **TXT**.

La plateforme vous les affiche déjà avec le bon nom, calculé pour votre domaine : page **Campagnes**, encart *Envoi d'emails*, section « Ces enregistrements restent à créer dans le DNS ». Un bouton copie chaque valeur, ce qui évite les fautes de frappe — une seule lettre de travers et le domaine reste non authentifié sans que rien n'indique pourquoi.

| Rôle | Nom | Valeur |
|---|---|---|
| Vérification | `votredomaine.com` | `brevo-code:…` **fourni par Brevo** |
| SPF | `votredomaine.com` | `v=spf1 include:spf.brevo.com ~all` |
| DKIM | `brevo._domainkey.votredomaine.com` | **fournie par Brevo** |
| DMARC | `_dmarc.votredomaine.com` | `v=DMARC1; p=none; rua=mailto:votre@adresse` |

Trois pièges courants :

- **Certains hébergeurs veulent le nom sans le domaine.** Si le champ affiche déjà `.votredomaine.com` à côté, saisissez `brevo._domainkey` et non le nom complet, sinon vous obtiendrez `brevo._domainkey.votredomaine.com.votredomaine.com`.
- **Pour le domaine racine**, certains hébergeurs attendent `@` plutôt que le nom complet.
- **Un domaine ne peut publier qu'un seul SPF.** S'il en existe déjà un, modifiez-le en y ajoutant `include:spf.brevo.com` avant le `~all` — n'en créez pas un second, les deux s'annuleraient.

## Étape 4 — Attendre, puis vérifier

La propagation prend de quelques minutes à quelques heures.

Revenez sur **Campagnes → Envoi d'emails** et cliquez sur **Revérifier**. Le panneau interroge le DNS en direct : les quatre lignes doivent passer au vert. Inutile d'attendre passivement — c'est le même contrôle que fait Brevo, et il vous dit lequel manque encore.

Chez Brevo, cliquez ensuite sur **Vérifier** sur la page du domaine.

## Étape 5 — Régler la plateforme

Dans Railway, variables du service backend :

```
MAIL_PROVIDER  = brevo
BREVO_API_KEY  = <clé créée dans Brevo, SMTP & API → Clés d'API>
MAIL_FROM      = contact@votredomaine.com
MAIL_FROM_NAME = Orange Digital Center Sénégal
MAIL_REPLY_TO  = abdoulmouhamed.fall@orange-sonatel.com
```

`MAIL_REPLY_TO` est le détail qui rend l'ensemble acceptable : le message **part** du nouveau domaine, qui est authentifié, mais toute réponse arrive dans votre boîte professionnelle habituelle. Les destinataires n'ont rien à changer.

Supprimez les variables `SMTP_*` devenues inutiles, ou laissez-les : `MAIL_PROVIDER=brevo` tranche explicitement.

## Étape 6 — Confirmer par un vrai envoi

Page **Campagnes**, encart *Envoi d'emails*, champ **Envoyer un email d'essai** : saisissez votre adresse et envoyez.

- **« Message accepté »** — c'est fait. Lancez une vraie campagne.
- Un refus : la cause exacte et la manœuvre correspondante sont affichées.

Ouvrez le message reçu dans Gmail, menu **⋮ → Afficher l'original**. Les trois lignes `SPF`, `DKIM` et `DMARC` doivent indiquer `PASS`. C'est la preuve définitive, celle que voient les serveurs destinataires.

## Ce que cette voie coûte, et ce qu'elle ne règle pas

L'adresse d'expédition ne sera plus `@orange-sonatel.com`. Pour un bénéficiaire, un message venant de `contact@insideodc.com` signé « Orange Digital Center Sénégal », avec une réponse qui arrive chez vous, reste parfaitement lisible — mais c'est un choix à assumer, et mieux vaut prévenir votre hiérarchie que le découvrir par une remarque.

Si un jour la DSI accepte de poser ces mêmes enregistrements sur un sous-domaine de `orangedigitalcenter.sn`, la bascule ne demandera que de changer `MAIL_FROM` : tout le reste est déjà en place. La demande toute prête est dans `demande-dns-delivrabilite.md`.

## La restriction par IP de Brevo : à désactiver

Brevo propose de n'accepter les appels d'API que depuis des adresses déclarées. Sur un hébergement comme Railway, **c'est une mauvaise idée** : l'adresse de sortie n'est pas fixe. Elle change à un redéploiement, à un redémarrage, parfois sans raison visible. Chaque changement casse les envois, avec ce message :

```
401 — We have detected you are using an unrecognised IP address <adresse>
```

Ajouter la nouvelle adresse débloque… jusqu'à la suivante. C'est une course perdue d'avance.

**Le réglage se trouve sur `app.brevo.com/security/authorised_ips`.** Désactivez-y la restriction.

Ce que cela change côté sécurité : la clé d'API redevient le seul identifiant. C'est le fonctionnement normal d'une API, et les précautions qui vont avec suffisent — la clé ne vit que dans les variables de l'hébergeur, jamais dans le dépôt, et se révoque en un clic si elle fuit.

L'alternative serait une adresse de sortie fixe côté hébergeur, une option payante sur certaines formules. À ne considérer que si une politique interne impose la restriction par IP.

## Volumes

Le compte gratuit de Brevo permet 300 messages par jour, ce qui couvre les emails automatiques et les attestations. Une campagne vers plusieurs centaines de bénéficiaires demande un compte payant — l'entrée de gamme se situe autour de 20 000 messages par mois.

La plateforme cadence de toute façon ses envois : `MAIL_DEBIT_PAR_MINUTE`, 25 par défaut.
