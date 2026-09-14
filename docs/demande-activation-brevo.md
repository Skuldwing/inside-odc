# Demande d'activation du compte Brevo

*Message à envoyer à `contact@brevo.com`, ou par la messagerie de l'interface Brevo.*

---

## Pourquoi cette demande

Brevo examine à la main les comptes neufs avant d'autoriser le premier envoi. C'est une mesure contre les expéditeurs abusifs, pas un défaut de configuration : le refus arrive **après** que tout le reste est en place.

```
403 — Unable to send email. Your SMTP account is not yet activated.
```

Aucun réglage de la plateforme n'y changera quoi que ce soit. Seul Brevo peut lever ce blocage.

## À faire avant d'écrire

L'activation est souvent retenue par un profil incomplet. Vérifiez dans les paramètres du compte :

- l'organisation est renseignée (nom, adresse, secteur d'activité) ;
- le numéro de téléphone est vérifié ;
- l'adresse e-mail du compte est confirmée ;
- le domaine d'envoi est authentifié — c'est déjà le cas, et c'est un argument à faire valoir.

## Ce qui fait accepter une demande

Brevo cherche à savoir trois choses : qui vous êtes, ce que vous enverrez, et **d'où viennent les adresses**. Ce dernier point est le plus important : une liste achetée ou collectée sans consentement est le motif de refus principal.

## Message type

À adapter là où c'est indiqué en gras entre crochets, puis à envoyer depuis l'adresse du compte Brevo.

---

**Objet :** Demande d'activation du compte et désactivation de la restriction par IP — inside-odc.com

Bonjour,

Notre compte n'est pas encore activé pour l'envoi. Nous vous écrivons pour en demander l'activation, et pour signaler une seconde difficulté liée à notre hébergement.

**Qui nous sommes.** Orange Digital Center Sénégal est un centre de formation et d'accompagnement au numérique situé à Dakar, ouvert gratuitement au public. Nous y accueillons des jeunes, des porteurs de projet et des entrepreneurs pour des formations, des ateliers de découverte et des programmes d'incubation. Notre plateforme interne de gestion, Inside ODC, assure le suivi des inscriptions et la communication avec les bénéficiaires.

**Ce que nous enverrons.** Trois types de messages, tous adressés à des personnes déjà inscrites chez nous :

1. *Messages transactionnels* — confirmations d'inscription, convocations aux sessions, liens de création de mot de passe pour les comptes de notre équipe.
2. *Attestations de participation* — un document PDF nominatif envoyé individuellement à chaque bénéficiaire à l'issue d'une formation.
3. *Lettre d'information* — un point sur les activités du centre, adressé aux personnes déjà passées par nos programmes.

**D'où viennent nos adresses.** Exclusivement de nos propres inscriptions : formulaires d'inscription aux activités du centre, remplis par les intéressés eux-mêmes, et fiches de présence signées sur place. Aucune liste achetée, louée, échangée ou collectée ailleurs. Nous n'importons aucun fichier de provenance externe.

**Nos garanties de conformité.** Elles sont déjà en place dans la plateforme, avant tout envoi :

- chaque message porte un lien de désabonnement en un clic, sans authentification ni formulaire ;
- les en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post: List-Unsubscribe=One-Click` accompagnent chaque envoi, conformément aux exigences de Google et Yahoo de février 2024 ;
- les désabonnements sont enregistrés et honorés automatiquement : une adresse désabonnée est exclue de tous les envois suivants, sans intervention manuelle ;
- nos envois sont cadencés côté serveur à 25 messages par minute, jamais en rafale ;
- chaque envoi est journalisé destinataire par destinataire, ce qui nous permet de suivre les échecs et de ne jamais réexpédier un message déjà reçu.

**Volumes attendus.** De l'ordre de **[à ajuster : quelques centaines]** de messages par mois, par vagues à la fin de chaque session de formation.

**Domaine d'envoi.** `inside-odc.com`, domaine dont nous sommes propriétaires et déjà authentifié auprès de vous : code de vérification publié, DKIM délégué par les deux enregistrements CNAME `brevo1._domainkey` et `brevo2._domainkey`, DMARC publié. L'adresse d'expédition est `contact@inside-odc.com`, une boîte réellement relevée.

**Seconde demande : la restriction par adresse IP.** Notre plateforme est hébergée sur un service dont l'adresse IP de sortie n'est pas fixe — elle change à chaque redéploiement. Nous avons été bloqués sur trois adresses différentes en quelques heures (`162.220.232.161`, puis `52.53.71.0`, entre autres), chacune autorisée puis aussitôt périmée. Merci de bien vouloir **désactiver la restriction par adresse IP** sur notre compte ; la clé d'API reste bien entendu conservée de façon sécurisée, hors de tout dépôt de code, et révocable à tout moment.

Nous restons à votre disposition pour tout complément ou toute vérification.

Cordialement,

**[Prénom Nom]**
**[Fonction]** — Orange Digital Center Sénégal
**[Téléphone]**
`contact@inside-odc.com`

---

### Ce qu'il reste à renseigner

| Marqueur | Ce qu'il faut mettre |
|---|---|
| Volumes | un ordre de grandeur réaliste ; mieux vaut sous-estimer que gonfler |
| Prénom Nom, Fonction | l'identité de la personne responsable du compte |
| Téléphone | un numéro joignable — Brevo appelle parfois pour valider |

Les adresses IP citées sont celles réellement rencontrées : elles rendent la demande concrète. Remplacez-les si d'autres apparaissent d'ici l'envoi.

## Après l'envoi

Comptez de quelques heures à deux jours ouvrés. Vous saurez que c'est passé sans rien avoir à surveiller : relancez simplement **Envoyer un email d'essai** depuis la page Campagnes.

En cas de refus ou de demande de précisions, répondez dans le même fil — un compte fermé ne se rouvre pas, alors qu'une demande en cours se discute.
