# Envoyer depuis une adresse `@orange-sonatel.com`

*Marche à suivre pour faire partir les emails de la plateforme depuis une
adresse professionnelle Sonatel, par exemple
`abdoulmouhamed.fall@orange-sonatel.com`.*

---

## Pourquoi cette voie fonctionne, là où l'actuelle échoue

Un serveur destinataire — Gmail, Yahoo, Outlook — ne regarde pas qui écrit le
message, mais **si le domaine annoncé dans le `From:` a autorisé le serveur qui
l'envoie**. C'est ce qu'on appelle l'alignement.

La configuration actuelle envoie par un compte `@orange-sonatel.com` tout en
s'annonçant `contact@orangedigitalcenter.sn`. Deux domaines différents : aucun
alignement possible, et `orangedigitalcenter.sn` ne publie de toute façon ni
SPF, ni DKIM, ni DMARC. Les messages sont donc rejetés ou classés en
indésirable — c'est exactement ce que signale Brevo.

`orange-sonatel.com`, lui, est un domaine Microsoft 365 en service : il publie
un DMARC (`v=DMARC1; p=none; …`) et ses MX pointent vers
`…mail.protection.outlook.com`. Envoyer **par** Exchange Online **en tant
qu'**une adresse de ce domaine aligne naturellement SPF et DKIM : Microsoft
signe pour son propre domaine. Il n'y a aucun enregistrement DNS à créer.

C'est la raison pour laquelle cette voie est la plus rapide : elle ne dépend
d'aucune demande à la DSI concernant le DNS.

## Ce qu'il faut obtenir de la DSI Sonatel

Une seule chose, mais elle est indispensable : **l'authentification SMTP doit
être activée sur la boîte** qui servira à envoyer.

Microsoft désactive `Authenticated SMTP` par défaut sur chaque boîte depuis
2020, et les *paramètres de sécurité par défaut* du tenant bloquent en général
l'authentification simple. Formulation à transmettre :

> Merci d'activer **SMTP AUTH (Authenticated SMTP)** sur la boîte
> `<adresse>`, afin qu'une application interne puisse envoyer via
> `smtp.office365.com` en TLS sur le port 587.
> Si l'authentification multifacteur est active sur ce compte, merci de fournir
> un **mot de passe d'application**, ou d'exclure ce compte de la stratégie
> d'accès conditionnel pour ce seul usage.

Si la DSI refuse l'authentification simple — c'est une position défendable et
de plus en plus fréquente — l'alternative est un **enregistrement d'application
Entra ID** avec la permission `Mail.Send`, et l'envoi via l'API Microsoft
Graph. C'est plus long à mettre en place et cela demande une évolution du code
de la plateforme ; à demander seulement si la première voie est fermée.

## Réglages à poser sur le serveur (Railway → Variables)

```
MAIL_PROVIDER = smtp
SMTP_HOST     = smtp.office365.com
SMTP_PORT     = 587
SMTP_SECURE   = false
SMTP_USER     = abdoulmouhamed.fall@orange-sonatel.com
SMTP_PASS     = <mot de passe, ou mot de passe d'application>
MAIL_FROM     = abdoulmouhamed.fall@orange-sonatel.com
MAIL_FROM_NAME = Orange Digital Center Sénégal
```

**Le point décisif est `MAIL_FROM`.** Il doit être identique à `SMTP_USER`.
Laisser `MAIL_FROM=contact@orangedigitalcenter.sn` en envoyant par un compte
`@orange-sonatel.com`, c'est reproduire à l'identique la panne actuelle.
Exchange Online refusera d'ailleurs le plus souvent d'envoyer au nom d'une
adresse sur laquelle le compte n'a pas de droit d'envoi.

`SMTP_SECURE=false` n'a rien d'un défaut de sécurité : le port 587 démarre en
clair puis chiffre par STARTTLS. C'est le port 465 qui demande
`SMTP_SECURE=true`.

## Ce que cela implique, et ce qui serait préférable

Envoyer depuis une adresse nominative a trois conséquences durables :

1. Les réponses, les avis de non-remise et les demandes de désabonnement
   arrivent dans **votre** boîte personnelle, mêlés à votre courrier.
2. Le jour où vous changez de poste, toutes les notifications de la plateforme
   s'arrêtent.
3. Les bénéficiaires reçoivent les attestations et les campagnes d'une
   personne, non du centre.

La boîte partagée `orangedigitalcenter@orange-sonatel.com` — déjà présente dans
la configuration actuelle — est sur le **même domaine**, donc exactement aussi
bien authentifiée, sans aucun de ces trois inconvénients. C'est le choix
recommandé :

```
SMTP_USER = orangedigitalcenter@orange-sonatel.com
MAIL_FROM = orangedigitalcenter@orange-sonatel.com
MAIL_REPLY_TO = abdoulmouhamed.fall@orange-sonatel.com
```

`MAIL_REPLY_TO` est facultatif : il fait partir le message du centre tout en
dirigeant les réponses vers vous. L'adresse d'expédition est contrainte par
l'authentification ; l'adresse de réponse, elle, est libre.

## Limites à connaître avant de lancer une campagne

Exchange Online est une messagerie d'entreprise, pas un routeur de campagnes.
Ses quotas, en ordre de grandeur :

| Limite | Valeur |
|---|---|
| Débit | ~30 messages par minute |
| Destinataires par jour | 10 000 |
| Destinataires par message | 500 |

Concrètement : parfait pour les **emails automatiques** (invitations, mots de
passe, notifications) et pour les **attestations**, qui partent une par une.
Convenable pour une campagne de quelques centaines de bénéficiaires, à
condition d'étaler l'envoi. Inadapté au-delà — et Microsoft interdit
explicitement l'usage d'Exchange Online pour l'emailing de masse ; un envoi
massif expose à une suspension du compte.

Pour les campagnes en nombre, Brevo reste la bonne réponse, avec le
sous-domaine dédié décrit dans `demande-dns-delivrabilite.md`. Les deux voies
ne s'excluent pas : `MAIL_PROVIDER` permet de basculer de l'une à l'autre sans
toucher au code.

## Vérifier que c'est en place

Page **Campagnes**, encart *Envoi d'emails* : il interroge le DNS en direct
depuis le serveur. Le champ **« Vérifier un autre domaine »** permet de jauger
`orange-sonatel.com` avant même de basculer, puis de confirmer après coup que
l'expéditeur retenu est bien authentifié et qu'aucune alerte d'alignement ne
subsiste.

Envoyer ensuite un message de test vers une adresse Gmail et ouvrir
*Afficher l'original* : les trois lignes `SPF`, `DKIM` et `DMARC` doivent
toutes indiquer `PASS`.
