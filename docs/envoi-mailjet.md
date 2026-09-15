# Envoyer par Mailjet

*Marche à suivre complète. Comptez une demi-heure, plus le délai de propagation DNS.*

---

## Pourquoi Mailjet

L'hébergement ferme le port SMTP sortant. La sonde du panneau *Envoi d'emails* l'a établi sur deux serveurs différents — Microsoft 365 puis OVH — avec la même signature : le port 443 répond en quelques millisecondes, le port 587 reste muet. Aucun réglage ne rouvrira ce port.

Il faut donc un service qui reçoit les messages **en HTTPS**, sur le port 443. Mailjet en est un : son API de soumission écoute sur `api.mailjet.com`, en HTTPS.

Rien d'autre ne motive ce choix. Brevo faisait le même travail, par le même canal ; c'est la suspension de notre compte qui a rendu nécessaire une seconde voie, pas une faiblesse technique.

## Étape 1 — Ouvrir le compte

Créez un compte sur mailjet.com et complétez le profil : organisation, adresse, téléphone vérifié.

**Faites-le sérieusement.** Un profil incomplet est ce qui retient le plus souvent l'activation d'un compte neuf, et c'est exactement ce qui nous est arrivé ailleurs.

## Étape 2 — Déclarer le domaine

Mailjet → **Expéditeurs et domaines** → ajoutez `inside-odc.com` puis lancez l'authentification.

Mailjet affiche alors deux valeurs à publier : une clé **DKIM** et un **include SPF**. Gardez la page ouverte, la clé DKIM n'existe que là.

## Étape 3 — Poser les enregistrements

Chez OVH, zone DNS du domaine. Le panneau *Envoi d'emails* de la plateforme affiche déjà ces enregistrements avec leur nom calculé, et un bouton pour copier chaque valeur.

| Rôle | Sous-domaine chez OVH | Type | Valeur |
|---|---|---|---|
| DKIM | `mailjet._domainkey` | TXT | fournie par Mailjet |
| SPF | *(vide)* | TXT | voir ci-dessous |

**Le SPF se modifie, il ne se duplique pas.** Le domaine en porte déjà un, posé par OVH avec la messagerie. Ouvrez-le et remplacez sa valeur par la version fusionnée :

```
v=spf1 include:mx.ovh.com include:spf.mailjet.com ~all
```

Un domaine ne peut publier qu'un seul SPF : en créer un second annule les deux, et rien ne le signale. La plateforme détecte le SPF en place et propose directement cette fusion.

Le DMARC est déjà publié et n'a pas à changer.

## Étape 4 — Vérifier

Attendez la propagation, puis cliquez sur **Revérifier** dans le panneau *Envoi d'emails*. Les lignes SPF et DKIM doivent passer au vert. Confirmez ensuite côté Mailjet.

## Étape 5 — Régler la plateforme

Mailjet → **Compte → Clés API**. Deux valeurs y figurent : la clé **publique** et la clé **privée**.

Dans Railway, variables du service backend :

```
MAIL_PROVIDER      = mailjet
MAILJET_API_KEY    = <clé publique>
MAILJET_API_SECRET = <clé privée>
MAIL_FROM          = contact@inside-odc.com
MAIL_FROM_NAME     = Orange Digital Center Sénégal
MAIL_REPLY_TO      = <votre adresse professionnelle>
```

**Le couple est indissociable** : n'en renseigner qu'une donne un refus d'authentification, et les intervertir aussi. Le panneau signale les deux cas.

Vous pouvez laisser les variables `BREVO_*` en place : `MAIL_PROVIDER` tranche explicitement, et elles resserviront si le compte Brevo est rétabli. Les variables `SMTP_*`, en revanche, ne serviront plus tant que l'hébergeur ferme le port.

## Étape 6 — Confirmer par un envoi réel

Panneau *Envoi d'emails* → **Envoyer un email d'essai**.

Puis ouvrez le message reçu dans Gmail, menu **⋮ → Afficher l'original** : `SPF`, `DKIM` et `DMARC` doivent indiquer `PASS`. C'est ce que voient les serveurs destinataires.

## Un piège propre à Mailjet

**Mailjet répond `200 OK` même quand il refuse un message.** Le verdict réel est dans le corps de la réponse, champ `Status` de chaque message.

La plateforme le contrôle : un refus est levé comme une erreur et apparaît dans le journal d'envoi. Sans cela, un message refusé aurait été compté comme parti, et le journal aurait menti — ce qui est pire que pas de journal du tout.

## Volumes

L'offre gratuite de Mailjet couvre quelques milliers de messages par mois, avec un plafond quotidien. Vérifiez les chiffres en vigueur au moment de l'inscription : ils changent.

La plateforme cadence de toute façon ses envois — `MAIL_DEBIT_PAR_MINUTE`, 25 par défaut.

## Si Brevo est rétabli entre-temps

Une seule variable à changer : `MAIL_PROVIDER=brevo`. Les enregistrements DKIM de Brevo sont toujours publiés, ceux de Mailjet ne les gênent pas — deux sélecteurs différents cohabitent sans difficulté. Seul le SPF porterait alors un include devenu inutile, sans conséquence.
