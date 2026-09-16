import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ODCLogo from "../components/branding/ODCLogo";
import { MENTIONS } from "../config/mentions";
import { IDENTITE } from "../config/identite";
import "../styles/landing.css";

/**
 * Mentions légales.
 *
 * Le site portait la marque Orange Digital Center et le nom Sonatel sans qu'un
 * visiteur puisse rien vérifier : ni éditeur nommé, ni adresse de contact, ni
 * hébergeur. Sur un domaine déposé quelques semaines plus tôt au nom d'un
 * particulier, ce profil est indiscernable de celui d'une usurpation de marque
 * — c'est ce que contrôle un service de conformité avant d'autoriser un compte
 * d'envoi, et la loi l'impose de toute façon à tout site.
 *
 * La page dit désormais ce que la plateforme est : un outil personnel. C'est
 * moins flatteur qu'une marque connue, et c'est vérifiable.
 */

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

        {/* Dit d'emblée ce que le reste de la page détaille. C'est la réponse à
            la question que se pose quiconque vérifie un expéditeur. */}
        <div className="ml-avis">
          <p>
            <strong>{IDENTITE.nom} est un projet personnel.</strong> Ce site n&apos;est pas
            édité par Orange, par Sonatel ni par aucune autre entreprise, et ne s&apos;exprime
            pas en leur nom. Les marques et logos cités sur ce site, le cas échéant,
            appartiennent à leurs titulaires respectifs.
          </p>
        </div>

        <Bloc titre="Éditeur du site">
          <dl>
            <dt>Éditeur</dt>
            <dd>
              <Valeur>{m.responsable}</Valeur>
              {m.editeurEstParticulier && (
                <span className="ml-precision"> — éditeur non professionnel</span>
              )}
            </dd>
            <dt>Lieu</dt>
            <dd><Valeur>{m.lieu}</Valeur></dd>
            <dt>Responsable de la publication</dt>
            <dd><Valeur>{m.responsable}</Valeur></dd>
            <dt>Contact</dt>
            <dd><a href={`mailto:${m.contact}`}>{m.contact}</a></dd>
          </dl>
        </Bloc>

        <Bloc titre="Objet du site">
          <p>
            {m.domaine} est un outil de suivi d&apos;activité pour un centre de formation
            numérique : activités, listes de présence, bénéficiaires, partenaires et
            dispositifs. Hormis la page de présentation et les pages de participation
            ouvertes par lien, l&apos;accès est réservé aux personnes autorisées sur
            authentification.
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
            Ils ne sont adressés qu&apos;à des personnes ayant participé à une activité ou à
            des partenaires identifiés. Aucune liste n&apos;est achetée, louée ni collectée
            automatiquement. Chaque message porte un lien de désabonnement fonctionnel, et
            une demande de désabonnement est appliquée immédiatement et sans condition.
          </p>
        </Bloc>

        <Bloc titre="Données personnelles">
          <p>
            La plateforme conserve, pour les personnes participant aux activités : nom,
            prénom, adresse électronique, numéro de téléphone, genre, tranche d&apos;âge,
            structure de rattachement et activités suivies. Ces données servent au suivi
            d&apos;activité, à l&apos;établissement des attestations de participation et aux
            statistiques de fréquentation.
          </p>
          <p>
            Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement et
            d&apos;opposition sur les données vous concernant. Écrivez à{" "}
            <a href={`mailto:${m.contact}`}>{m.contact}</a> : la demande est traitée dans les
            meilleurs délais.
          </p>
        </Bloc>

        <footer className="ml-pied">
          <p>© {new Date().getFullYear()} {IDENTITE.nom}</p>
        </footer>
      </main>
    </div>
  );
}
