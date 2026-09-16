import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ODCLogo from "../components/branding/ODCLogo";
import "../styles/landing.css";

/**
 * Mentions légales.
 *
 * Le site portait la marque Orange Digital Center et le nom Sonatel sans qu'un
 * visiteur puisse vérifier quoi que ce soit : ni éditeur nommé, ni adresse de
 * contact, ni hébergeur. Sur un domaine déposé quelques semaines plus tôt au
 * nom d'un particulier, ce profil est indiscernable de celui d'une usurpation
 * de marque — c'est ce que contrôle un service de conformité avant d'autoriser
 * un compte d'envoi, et la loi française l'impose de toute façon à tout site.
 *
 * Les valeurs qui identifient l'entité juridique ne sont pas devinées : elles
 * viennent de `mentions.js`, que l'exploitant renseigne. Tant qu'une valeur
 * manque, la page le dit plutôt que d'afficher une information inventée.
 */

import { MENTIONS } from "../config/mentions";

function Valeur({ children }) {
  if (children === null || children === undefined || children === "") {
    return <em className="ml-manque">à compléter</em>;
  }
  return <>{children}</>;
}

function Bloc({ titre, children }) {
  return (
    <section className="ml-bloc">
      <h2>{titre}</h2>
      {children}
    </section>
  );
}

export default function MentionsLegales() {
  const m = MENTIONS;

  return (
    <div className="lp ml">
      <header className="ml-entete">
        <div className="lp-conteneur ml-entete-inner">
          <Link to="/" className="ml-retour">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour à l&apos;accueil
          </Link>
          <ODCLogo variant="full" className="h-9" />
        </div>
      </header>

      <main className="lp-conteneur ml-corps">
        <h1>Mentions légales</h1>
        <p className="ml-chapeau">
          Informations relatives à l&apos;éditeur du site {m.domaine}, à son hébergement et au
          traitement des données des personnes qui y figurent.
        </p>

        <Bloc titre="Éditeur du site">
          <dl>
            <dt>Entité</dt>
            <dd><Valeur>{m.entite}</Valeur></dd>
            <dt>Forme juridique et immatriculation</dt>
            <dd><Valeur>{m.immatriculation}</Valeur></dd>
            <dt>Adresse</dt>
            <dd><Valeur>{m.adresse}</Valeur></dd>
            <dt>Responsable de la publication</dt>
            <dd><Valeur>{m.responsable}</Valeur></dd>
            <dt>Contact</dt>
            <dd>
              <a href={`mailto:${m.contact}`}>{m.contact}</a>
            </dd>
          </dl>
        </Bloc>

        <Bloc titre="Objet du site">
          <p>
            {m.domaine} est la plateforme interne de gestion de l&apos;Orange Digital Center
            Sénégal : suivi des activités de formation, des participants, des partenaires et
            des dispositifs. Elle n&apos;est pas ouverte au public : hormis la page de
            présentation, l&apos;accès est réservé aux membres de l&apos;équipe sur
            authentification.
          </p>
          <p>
            Les marques, logos et dénominations Orange, Sonatel et Orange Digital Center
            appartiennent à leurs titulaires respectifs et sont utilisés ici{" "}
            <Valeur>{m.autorisation}</Valeur>.
          </p>
        </Bloc>

        <Bloc titre="Hébergement">
          <dl>
            <dt>Interface</dt>
            <dd>Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis</dd>
            <dt>Application et base de données</dt>
            <dd>Railway Corp., 3721 Buchanan St, San Francisco, CA 94123, États-Unis</dd>
            <dt>Nom de domaine</dt>
            <dd>OVH SAS, 2 rue Kellermann, 59100 Roubaix, France</dd>
          </dl>
        </Bloc>

        <Bloc titre="Courriers électroniques">
          <p>
            Les messages envoyés depuis la plateforme — attestations de participation,
            informations relatives aux activités — partent de l&apos;adresse{" "}
            <a href={`mailto:${m.expediteur}`}>{m.expediteur}</a>, avec{" "}
            <a href={`mailto:${m.reponse}`}>{m.reponse}</a> en adresse de réponse.
          </p>
          <p>
            Ils ne sont adressés qu&apos;à des personnes ayant participé à une activité du
            centre ou à des partenaires identifiés. Aucune liste n&apos;est achetée, louée ni
            collectée automatiquement. Chaque message porte un lien de désabonnement
            fonctionnel, et une demande de désabonnement est appliquée immédiatement et sans
            condition.
          </p>
        </Bloc>

        <Bloc titre="Données personnelles">
          <p>
            La plateforme conserve, pour les personnes participant aux activités : nom,
            prénom, adresse électronique, numéro de téléphone, genre, tranche d&apos;âge,
            structure de rattachement et activités suivies. Ces données servent au suivi
            d&apos;activité du centre, à l&apos;établissement des attestations de participation
            et aux statistiques de fréquentation.
          </p>
          <p>
            Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement et
            d&apos;opposition sur les données vous concernant. Écrivez à{" "}
            <a href={`mailto:${m.contact}`}>{m.contact}</a> : la demande est traitée dans les
            meilleurs délais.
          </p>
        </Bloc>

        <footer className="ml-pied">
          <p>© {new Date().getFullYear()} Orange Digital Center Sénégal · Sonatel</p>
        </footer>
      </main>
    </div>
  );
}
