/**
 * Banc d'essai de la detection des doublons d'une liste.
 *
 *   node scripts/verifierDoublonsListe.js
 *
 * Chaque cas est une situation rencontree sur de vraies listes de presence :
 * nom et prenom inverses, une ligne avec contact et l'autre sans, numeros
 * ecrits avec ou sans +221, El Hadji / Elhadji, Ndiaye / Ndiay, homonymes aux
 * numeros differents, telephone d'ecole porte par plusieurs enfants, noms
 * frequents sur une grande liste. Une regle qu'on change doit les tenir tous.
 * Aucune base, aucun fichier : le script sort en erreur si un cas echoue.
 */
const D = require("../services/doublonsListe");
let ok = 0, ko = 0;
const verif = (titre, cond, detail) => { if (cond) ok++; else { ko++; console.log("ÉCHEC:", titre, detail !== undefined ? JSON.stringify(detail) : ""); } };
const L = (nom, prenom, telephone = null, email = null, genre = null, age = null) => ({ nom, prenom, telephone, email, genre, age });
const niveauPaire = (a, b) => { const r = D.analyserDoublons([a, b]); return r.groupes[0]?.niveau || null; };

// 1. Cas de la collègue : même nom, l'un avec contact, l'autre sans
verif("même nom, un seul a un numéro", niveauPaire(L("Niang","Awa"), L("Niang","Awa","77 483 92 15")) === "probable");
verif("même nom, un seul a un email", niveauPaire(L("Niang","Awa",null,"awa@gmail.com"), L("NIANG","awa")) === "probable");
// 2. Inversion nom/prénom
verif("inversion", niveauPaire(L("Awa","Niang"), L("Niang","Awa")) === "probable");
verif("inversion + même tel", niveauPaire(L("Awa","Niang","774839215"), L("Niang","Awa","+221 77 483 92 15")) === "certain");
verif("raison inversion", D.analyserDoublons([L("Awa","Niang"), L("Niang","Awa")]).groupes[0].raisons[0].includes("inversés"));
// 3. Formats de téléphone
verif("tel formats", JSON.stringify(D.telephonesDe("00221 77-483-92-15")) === '["774839215"]', D.telephonesDe("00221 77-483-92-15"));
verif("tel 2 numéros", D.telephonesDe("77 483 92 15 / 78 551 90 24").length === 2);
verif("tel collés", D.telephonesDe("774839215785519024").length === 2, D.telephonesDe("774839215785519024"));
verif("tel fictif", D.telephonesDe("77 000 00 00").length === 0);
verif("tel excel nombre", JSON.stringify(D.telephonesDe(774839215)) === '["774839215"]');
// 4. Accents, casse, apostrophes, El Hadji
verif("accents/apostrophe", niveauPaire(L("N'Diaye","Aïssatou"), L("NDIAYE","aissatou")) === "probable");
verif("El Hadji", niveauPaire(L("Diop","El Hadji Malick","776402871"), L("Diop","Elhadji Malick","776402871")) === "certain");
verif("Ndeye Fatou collé", niveauPaire(L("Diop","Ndeye Fatou"), L("Diop","Ndeyefatou")) === "probable");
// 5. Variantes sonores
verif("Ndiaye/Ndiay", niveauPaire(L("Ndiaye","Fatou"), L("Ndiay","Fatou")) === "probable");
verif("Mouhamed/Mohamed", niveauPaire(L("Fall","Mouhamed"), L("Fal","Mohamed")) === "probable");
verif("Khady/Kadi", niveauPaire(L("Seck","Khady"), L("Sek","Kadi")) === "probable");
// 6. Faute de frappe
verif("faute sans contact → à vérifier", niveauPaire(L("Ndiaye","Mariama"), L("Ndiaye","Mariana")) === "a_verifier");
verif("faute + même tel → certain", niveauPaire(L("Ndiaye","Mariama","776402871"), L("Ndiaye","Mariana","776402871")) === "certain");
// 7. Homonymes
verif("même nom, numéros différents → à vérifier", niveauPaire(L("Diallo","Aissatou","776402871"), L("Diallo","Aissatou","783310946")) === "a_verifier");
verif("numéros à un chiffre près → probable", niveauPaire(L("Diallo","Aissatou","776402871"), L("Diallo","Aissatou","776402872")) === "probable");
verif("genre différent sans contact → à vérifier", niveauPaire(L("Sow","Ndeye","",null,"F"), L("Sow","Ndeye","",null,"H")) === "a_verifier");
// 8. Noms différents → rien
verif("frères", niveauPaire(L("Sow","Awa","776402871"), L("Sow","Moussa","776402871")) === null);
verif("Diouf/Dioum → à vérifier seulement", niveauPaire(L("Diouf","Cheikh"), L("Dioum","Cheikh")) === "a_verifier");
verif("Gueye/Gaye", niveauPaire(L("Gueye","Modou"), L("Gaye","Modou")) === null);
verif("Sarr/Sall", niveauPaire(L("Sarr","Ibrahima"), L("Sall","Ibrahima")) === null);
verif("Awa/Ada sans contact", niveauPaire(L("Diop","Awa"), L("Diop","Ada")) === null);
// 9. Prénom composé
verif("incluse sans contact → à vérifier", niveauPaire(L("Diop","Awa"), L("Diop","Awa Marie")) === "a_verifier");
verif("incluse + même tel → certain", niveauPaire(L("Diop","Awa","776402871"), L("Diop","Awa Marie","776402871")) === "certain");
// 10. Nom recopié dans le prénom
verif("nom recopié", niveauPaire(L("Samb","Rockaya Samb"), L("Samb","Rockaya")) === "probable");
// 11. Email gmail points + faute de domaine
verif("gmail points", niveauPaire(L("Niang","Awa",null,"awa.niang@gmail.com"), L("Niang","Awa",null,"AwaNiang@gmial.com")) === "certain");
verif("email même boîte autre domaine", niveauPaire(L("Niang","Awa",null,"awaniang@yahoo.fr"), L("Niang","Awa",null,"awaniang@yahoo.com")) === "probable");
// 12. Contact collectif (école) : 4 enfants, même numéro
const ecole = ["Awa","Moussa","Fatou","Ibou"].map(p => L("Ba", p, "338214765"));
verif("contact collectif ne réunit pas", D.analyserDoublons(ecole).groupes.length === 0, D.analyserDoublons(ecole));
const ecole2 = [...ecole, L("Ba","Awa","338214765")];
verif("collectif + vrai doublon de nom → probable", D.analyserDoublons(ecole2).groupes.length === 1 && D.analyserDoublons(ecole2).groupes[0].niveau === "probable", D.analyserDoublons(ecole2).groupes);
// 13. Ambiguïté : sans numéro entre deux homonymes aux numéros différents
const amb = D.analyserDoublons([L("Niang","Awa","776402871"), L("Niang","Awa"), L("Niang","Awa","785527013")]);
verif("ambigu : jamais les deux numéros réunis", !amb.groupes.some(g => g.defaut === "fusionner" && g.lignes.includes(0) && g.lignes.includes(2)), amb.groupes);
verif("ambigu : une question posée", amb.groupes.some(g => g.niveau === "a_verifier"), amb.groupes);
// 14. Partielle
verif("Diop seul vs Awa Diop", niveauPaire(L("Diop",""), L("Diop","Awa")) === "a_verifier");
const trois = D.analyserDoublons([L("Diop",""), L("Diop","Awa"), L("Diop","Moussa")]);
verif("Diop seul vs deux Diop → rien", trois.groupes.length === 0, trois.groupes);
// 15. Lignes sans nom même contact
verif("sans nom même tel", niveauPaire(L("","","774839215"), L(null,null,"77 483 92 15")) === "probable");
// 16. Initiale
verif("initiale", niveauPaire(L("Diop","Awa M.","776402871"), L("Diop","Awa Marie","776402871")) === "certain");
// 17. regrouper
verif("regrouper", JSON.stringify(D.regrouper(5, [[0,3],[1,4],[3,2]])) === "[[0,2,3],[1,4]]", D.regrouper(5, [[0,3],[1,4],[3,2]]));
// 18. Exact repeated line
verif("ligne répétée", niveauPaire(L("Fall","Modou","774839215","modou@x.sn","H"), L("Fall","Modou","774839215","modou@x.sn","H")) === "certain");
// 19. Civilité
verif("civilité", niveauPaire(L("Fall","Mme Aminata"), L("Fall","Aminata")) === "probable");
// 20. Genre brut non reconnu ne contredit pas
verif("genre brut", niveauPaire(L("Fall","Aminata",null,null,"Féminin"), L("Fall","Aminata",null,null,"F")) === "probable");
const PR = ["Awa","Fatou","Moussa","Mamadou","Aissatou","Ibrahima","Ndeye","Cheikh","Khady","Ousmane","Mariama","Abdoulaye","Seynabou","Modou","Aminata","Astou","Bineta","Coumba","Daouda","Dieynaba","Babacar","Pape","Mame","Saliou","Lamine","Assane","Penda","Rokhaya","Sokhna","Yacine","Adama","Alioune","Boubacar","Djibril","Elhadji","Fallou","Habib","Issa","Khadim","Malick"];
const NO = ["Diop","Ndiaye","Fall","Sow","Ba","Diallo","Gueye","Faye","Sarr","Seck","Thiam","Mbaye","Cisse","Kane","Niang","Diouf","Sy","Ndour","Toure","Camara","Mane","Sene","Wade","Dieng","Lo","Ly","Mbengue","Ndoye","Sall","Tall"];
let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const num = () => "7" + pick(["0","5","6","7","8"]) + String(Math.floor(rnd() * 1e7)).padStart(7, "0");
// petite liste : Fatou Diop x2 (un seul a un numéro) parmi 30 → probable
const petite = [];
for (let i = 0; i < 28; i++) petite.push(L(pick(NO), pick(PR), num()));
petite.push(L("Diop","Fatou", "776402871"), L("Diop","Fatou"));
const gp = D.analyserDoublons(petite).groupes.find(g => g.lignes.includes(28) && g.lignes.includes(29));
verif("petite liste → probable", gp && gp.niveau === "probable", gp);
// grande liste : 100 Diop, 80 Fatou sur 2000 → à vérifier
const grandeL = [];
for (let i = 0; i < 1998; i++) grandeL.push(L(i < 100 ? "Diop" : pick(NO.slice(1)), i % 25 === 0 ? "Fatou" : pick(PR.slice(1)), num()));
grandeL.push(L("Diop","Fatou","776402871"), L("Diop","Fatou"));
const gg = D.analyserDoublons(grandeL).groupes.find(g => g.lignes.includes(1998) && g.lignes.includes(1999));
verif("grande liste nom fréquent → à vérifier", gg && gg.niveau === "a_verifier", gg);
console.log(`${ok} cas tenus, ${ko} en echec`);
process.exit(ko ? 1 : 0);
