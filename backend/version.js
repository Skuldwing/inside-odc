/**
 * Version reellement en service.
 *
 * Une route absente renvoie « Route introuvable », ce qui ne dit pas si le
 * code est ancien ou la route mal ecrite. La distinction a coute cher : on a
 * cherche une panne d'envoi d'emails pendant que le serveur executait une
 * version anterieure, deployee avant le correctif. Le commit en service doit
 * donc etre lisible depuis l'application elle-meme.
 *
 * La date de demarrage suffit d'ailleurs a trancher, meme sans commit : si le
 * serveur tourne depuis avant le dernier envoi sur main, il n'a pas repris le
 * code.
 */

const DEMARRE_LE = new Date().toISOString();

/* Railway renseigne RAILWAY_GIT_COMMIT_SHA ; les autres noms couvrent Heroku
   et les executions en conteneur ou la valeur est passee a la main. */
const COMMIT_DEPLOYE =
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.SOURCE_VERSION ||
  process.env.GIT_COMMIT ||
  null;

function infoVersion() {
  return {
    commit: COMMIT_DEPLOYE ? String(COMMIT_DEPLOYE).slice(0, 7) : null,
    demarre_le: DEMARRE_LE,
  };
}

module.exports = { infoVersion, DEMARRE_LE, COMMIT_DEPLOYE };
