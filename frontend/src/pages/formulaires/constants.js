export const FIELD_TYPES = [
  { value: "text",      label: "Texte court",     icon: "✏️",  group: "Texte"        },
  { value: "textarea",  label: "Texte long",       icon: "📝",  group: "Texte"        },
  { value: "email",     label: "Email",            icon: "📧",  group: "Contact"      },
  { value: "phone",     label: "Téléphone",        icon: "📞",  group: "Contact"      },
  { value: "url",       label: "URL / Lien",       icon: "🔗",  group: "Contact"      },
  { value: "number",    label: "Nombre",           icon: "🔢",  group: "Nombre"       },
  { value: "scale",     label: "Échelle 1-10",     icon: "📊",  group: "Nombre"       },
  { value: "date",      label: "Date",             icon: "📅",  group: "Date"         },
  { value: "time",      label: "Heure",            icon: "🕐",  group: "Date"         },
  { value: "select",    label: "Liste déroulante", icon: "▼",   group: "Choix"        },
  { value: "radio",     label: "Choix unique",     icon: "🔘",  group: "Choix"        },
  { value: "checkbox",  label: "Cases à cocher",   icon: "☑️",  group: "Choix"        },
  { value: "yes_no",    label: "Oui / Non",        icon: "✅",  group: "Choix"        },
  { value: "rating",    label: "Étoiles (1-5)",    icon: "⭐",  group: "Évaluation"   },
  { value: "separator", label: "Séparateur/Titre", icon: "—",   group: "Mise en page" },
];

export const CONDITION_OPERATORS = [
  { value: "eq",           label: "est égal à"     },
  { value: "neq",          label: "différent de"   },
  { value: "contains",     label: "contient"       },
  { value: "starts_with",  label: "commence par"   },
  { value: "ends_with",    label: "finit par"      },
  { value: "gt",           label: "supérieur à"    },
  { value: "lt",           label: "inférieur à"    },
  { value: "gte",          label: "≥ sup. ou égal" },
  { value: "lte",          label: "≤ inf. ou égal" },
  { value: "is_empty",     label: "est vide"       },
  { value: "is_not_empty", label: "n'est pas vide" },
];

export const FORM_EDITOR_DRAFT_KEY = "inside_odc_form_editor_draft_v1";

export const EDITOR_TABS = [
  { id: "champs",    label: "Champs"     },
  { id: "apparence", label: "Apparence"  },
  { id: "settings",  label: "Paramètres" },
  { id: "reponses",  label: "Réponses"   },
];
