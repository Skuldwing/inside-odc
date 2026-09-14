# Demande de configuration DNS — envoi d'emails Orange Digital Center Sénégal

*Document à transmettre à l'administrateur de la zone DNS de `orangedigitalcenter.sn`.*

---

## Objet

Les emails envoyés par la plateforme Inside ODC au nom de
`@orangedigitalcenter.sn` n'arrivent plus à destination. Notre routeur d'emails
(Brevo) refuse désormais l'expéditeur, et les messages qui partent encore sont
rejetés ou classés en indésirable par Gmail, Yahoo et Outlook.

La cause n'est pas applicative : **le domaine `orangedigitalcenter.sn` ne
publie aucun enregistrement d'authentification d'email.**

## Constat

Relevé DNS du domaine :

| Enregistrement | Rôle | État |
|---|---|---|
| `SPF` (TXT) | désigne les serveurs autorisés à envoyer pour le domaine | **absent** |
| `DKIM` (TXT) | clé publique permettant de vérifier la signature des messages | **absent** |
| `DMARC` (TXT sur `_dmarc.`) | indique au destinataire quoi faire si SPF/DKIM échouent | **absent** |
| `MX` | serveurs de réception du courrier | **absent** |

À titre de comparaison, `orange-sonatel.com` publie bien un DMARC
(`v=DMARC1; p=none; …`) et des MX Microsoft 365.

Depuis février 2024, Gmail, Yahoo et Microsoft imposent à **tout** expéditeur :
SPF **et** DKIM valides et alignés avec le domaine du `From:`, plus un
enregistrement DMARC. Sans ces trois éléments, la remise n'est plus assurée —
c'est exactement ce que signale notre routeur.

L'absence de MX pose un second problème : une adresse `@orangedigitalcenter.sn`
ne peut recevoir aucune réponse, ce qui dégrade encore la réputation
d'expédition.

## Demande

### Option recommandée — un sous-domaine dédié

Créer un sous-domaine réservé aux envois de la plateforme, par exemple
`mail.orangedigitalcenter.sn`.

C'est la pratique courante : la réputation des envois en nombre reste isolée du
domaine principal, et un incident sur les campagnes n'affecte pas la messagerie
de l'organisation. Cela n'exige aucune modification des enregistrements
existants du domaine racine.

### Enregistrements à créer

**1. SPF** — sur le domaine d'envoi retenu

```
Type : TXT
Nom  : mail            (ou @ si le domaine racine est retenu)
Valeur : v=spf1 include:spf.brevo.com ~all
```

Si un SPF existe déjà sur ce nom, **ne pas en créer un second** : un domaine ne
peut publier qu'un seul SPF. Ajouter `include:spf.brevo.com` à l'existant,
avant le `~all`.

**2. DKIM** — valeur fournie par Brevo

Brevo génère une clé propre à notre compte. Elle se récupère dans
*Expéditeurs & IP → Domaines → Authentifier ce domaine*, et se présente sous la
forme :

```
Type : TXT
Nom  : brevo._domainkey.mail
Valeur : k=rsa; p=<clé publique fournie par Brevo>
```

**3. Code de vérification du domaine** — valeur fournie par Brevo

```
Type : TXT
Nom  : mail
Valeur : brevo-code:<code fourni par Brevo>
```

**4. DMARC**

```
Type : TXT
Nom  : _dmarc.mail
Valeur : v=DMARC1; p=none; rua=mailto:<adresse de réception des rapports>
```

`p=none` n'impose aucun rejet : il satisfait l'exigence de Gmail et Yahoo tout
en permettant d'observer le trafic avant de durcir la politique. Un passage à
`p=quarantine` puis `p=reject` est souhaitable une fois les rapports stabilisés.

**5. MX** *(optionnel mais recommandé)*

Pour que les réponses et les avis de non-remise arrivent quelque part. À défaut,
utiliser comme adresse d'expédition une boîte réellement relevée.

## Après la mise en place

La propagation prend de quelques minutes à quelques heures. La plateforme
Inside ODC intègre un contrôle automatique — page **Campagnes**, encart
*Envoi d'emails* — qui interroge le DNS en direct et indique pour chaque
enregistrement s'il est en place. Il suffit de le consulter pour confirmer que
la demande a abouti, sans outil externe.

## Contact

Toute question technique peut être adressée à l'équipe Inside ODC.
