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

> Objet : Demande d'activation de compte — Orange Digital Center Sénégal
>
> Bonjour,
>
> Notre compte n'est pas encore activé pour l'envoi et nous vous écrivons pour en demander l'activation.
>
> **Qui nous sommes.** Orange Digital Center Sénégal est un centre de formation et d'accompagnement au numérique situé à Dakar. Nous accueillons des jeunes, des porteurs de projet et des entrepreneurs pour des formations, des ateliers et des programmes d'incubation.
>
> **Ce que nous enverrons.** Trois types de messages, tous liés à une inscription existante :
> - des messages transactionnels : confirmations d'inscription, convocations, liens de création de mot de passe ;
> - des attestations de participation nominatives, en pièce jointe PDF, à l'issue de chaque formation ;
> - une lettre d'information sur nos activités, adressée aux personnes déjà passées par le centre.
>
> **D'où viennent nos adresses.** Exclusivement de nos propres inscriptions : formulaires d'inscription aux activités du centre et fiches de présence signées sur place. Aucune liste achetée, louée ou collectée ailleurs. Chaque message porte un lien de désabonnement en un clic, et les en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post` ; les désabonnements sont honorés automatiquement et exclus des envois suivants.
>
> **Volumes attendus.** De l'ordre de quelques centaines de messages par mois, par vagues à la fin de chaque session de formation. Nos envois sont cadencés côté serveur, à 25 messages par minute.
>
> **Domaine d'envoi.** `inside-odc.com`, authentifié auprès de vous : code de vérification publié, DKIM délégué par les deux enregistrements CNAME `brevo1._domainkey` et `brevo2._domainkey`, DMARC publié. L'adresse d'expédition est `contact@inside-odc.com`, qui est une boîte réellement relevée.
>
> Nous restons à votre disposition pour tout complément.
>
> Cordialement,

## Après l'envoi

Comptez de quelques heures à deux jours ouvrés. Vous saurez que c'est passé sans rien avoir à surveiller : relancez simplement **Envoyer un email d'essai** depuis la page Campagnes.

En cas de refus ou de demande de précisions, répondez dans le même fil — un compte fermé ne se rouvre pas, alors qu'une demande en cours se discute.
