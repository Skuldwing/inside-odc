# Écran de revue des fiches, groupe par groupe

*Cadrage d'un chantier à venir. Rien de ce qui suit n'est encore construit ;
tout ce sur quoi il s'appuie, si.*

---

## Ce qui manque, et pourquoi

La page Participants annonce **703 personnes ayant plusieurs fiches**. La
plateforme sait en traiter une partie toute seule : quand deux fiches portent
la **même adresse ou le même numéro**, elles désignent la même personne, et le
bouton « Compléter et rattacher » s'en charge — une quarantaine de groupes.

Les **660 autres** n'ont que le nom pour elles. Or le nom ne désigne pas une
personne : sur une liste de trois cents, « Seynabou Ndiaye » peut être deux
femmes, et sur une liste d'atelier pour enfants — où ni adresse ni numéro ne
sont demandés — c'est le cas ordinaire, pas l'exception.

C'est pourquoi la plateforme ne les rattache pas d'office. Mais elle ne donne
pas non plus de quoi trancher : le panneau les liste, sans permettre de
comparer deux fiches côte à côte ni d'enregistrer une décision. Six cent
soixante décisions qu'on ne peut pas prendre, ça revient à ne pas les proposer.

Le même manque bloque une seconde revue : **34 inscriptions retirées** en
septembre sur le seul nom, dont on ne sait toujours pas si elles étaient
justifiées (voir plus bas).

---

## Ce sur quoi l'écran s'appuie — déjà en place

Rien n'est à construire côté données. L'identité existe depuis la refonte
« chaîne fiable » :

| | |
|---|---|
| `personnes` | l'identité, un identifiant stable |
| `participants.personne_id` | la ligne de liste de présence, rattachée à une personne |

Et les gestes aussi, dans `backend/services/identite.js` :

- `reunir(client, ficheIds)` — rattache, et rend de quoi défaire
- `defaire(client, deplacees)` — rend à chaque fiche **son** identité, pas une
  équivalente
- `separer(client, ficheId)` — donne une identité neuve à une fiche

Les routes existantes :

| Route | Rôle |
|---|---|
| `GET /participants/fiches-doublons` | les groupes, avec `preuve` (`contact` / `nom_seul`), `conflits`, `partage` |
| `POST /participants/fiches-doublons/completer` | complète, et rattache ce qui est prouvé |
| `GET /participants/fiches-rattachees` | ce qui a été rattaché, et sur quoi |
| `POST /participants/fiches-rattachees/separer` | défait, fiche par fiche |

**Aucune suppression nulle part.** Une ligne de liste de présence est un
document : on ne réécrit pas une feuille d'émargement signée. C'est ce qui rend
toute décision réversible, et donc une revue à la main acceptable — se tromper
ne coûte qu'un clic de retour.

---

## Ce que l'écran doit montrer

Une décision se prend sur ce qui **décrit la personne**, pas sur ce qu'elle a
fait. Pour chaque groupe, les fiches côte à côte, et en premier les champs qui
tranchent :

- **genre** et **tranche d'âge** — un désaccord ici interdit déjà le
  rattachement automatique ; c'est ce qui sépare un enfant de Kids Tech d'un
  adulte de Tech Academy du même nom
- **structure** — « UCAD » face à « Lycée Blaise » n'est pas la même personne
- **adresse** et **numéro** — quand une seule fiche en porte un, il ne prouve
  rien mais il renseigne
- **les activités de chaque fiche**, avec leur date : deux fiches sur **la même
  formation** sont le cas le plus probable d'homonymes ; sur deux formations
  différentes, c'est quelqu'un qui est revenu

Trois issues par groupe, pas deux : **la même personne** (rattacher), **deux
personnes** (laisser, et ne plus proposer), **je ne sais pas** (passer). La
troisième compte : forcer un choix binaire produit des décisions au hasard, et
c'est exactement ce qu'on cherche à éviter.

Une décision « deux personnes » doit se retenir, sinon le groupe revient à
chaque visite et la revue ne finit jamais.

---

## Points à trancher avant de commencer

1. **Où vit la décision « deux personnes » ?** Le journal d'audit suffit-il, ou
   faut-il une table ? Le journal a l'avantage d'exister ; il a l'inconvénient
   de se lire par des `details->>` peu commodes.

2. **Par quoi commencer la file ?** Les groupes les plus nombreux en fiches, les
   plus récents, ou ceux dont les fiches portent le plus de renseignements —
   donc les plus faciles à trancher.

3. **Faut-il un mode « par activité » ?** Les 34 retraits de septembre se
   revoient plus naturellement activité par activité que personne par personne.

4. **Qui a le droit ?** Aujourd'hui `admin` seulement, comme les autres
   panneaux de réparation. À confirmer.

---

## Les 34 retraits de septembre, à revoir

Le 22 septembre, 929 inscriptions ont été retirées en une opération. **461**
portaient sur des fiches que la restauration de 11h37 venait de recréer : les
retirer était juste. **434** étaient adossées à une adresse ou un numéro.

Restent **34** retraits sur des fiches antérieures, sans aucune coordonnée.
Répartis sur 9 activités :

| Activité | Retraits |
|---|---|
| #111 Community Management Essentiel | 15 |
| #93 Créer des contenus avec Canva | 6 |
| #97 WordPress | 4 |
| #168 Samedi Tech-ki cybersécurité | 3 |
| #29 AASTIC JDAS 2026 | 2 |
| #142, #141, #117, #110 | 1 chacune |

Le plus douteux : **trois fiches « Seynabou Ndiaye »** sur l'activité #93,
rattachées à la fiche 6259. Quatre inscriptions du même nom sur une seule
liste, sans rien pour le prouver.

Les fiches existent toutes — rien n'a été supprimé de ce côté. La comparaison
se fait donc dans Participants, et la remise en place depuis « Inscriptions
retirées ».

---

## Ce que ce chantier ne doit pas refaire

Trois pièges déjà rencontrés, tous dans le même code :

- **Un groupe traité qui reste proposé.** Vérifier que la décision le retire de
  la file, sinon on le « traite » indéfiniment.
- **Une comparaison d'identifiants de journal.** `audit_logs.id` est un
  `BIGSERIAL` : le pilote PostgreSQL le rend **en chaîne**. Comparé à un nombre,
  il ne correspond jamais — 518 fiches déjà remises en place sont restées
  proposées pour cette raison. Comparer en chaînes des deux côtés.
- **Une base d'essai qui ne ressemble pas à la production.** Le piège
  ci-dessus ne se voit pas si la colonne y est un entier 32 bits. Aligner les
  types avant d'écrire l'essai.
