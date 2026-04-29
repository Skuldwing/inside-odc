export const FIELD_TYPES = [
  { value: "text",      label: "Texte court",       icon: "✏️" },
  { value: "textarea",  label: "Texte long",         icon: "📝" },
  { value: "email",     label: "Email",              icon: "📧" },
  { value: "phone",     label: "Telephone",          icon: "📞" },
  { value: "number",    label: "Nombre",             icon: "🔢" },
  { value: "date",      label: "Date",               icon: "📅" },
  { value: "select",    label: "Liste deroulante",   icon: "▼" },
  { value: "checkbox",  label: "Cases a cocher",     icon: "☑️" },
  { value: "rating",    label: "Note (1-5 etoiles)", icon: "⭐" },
  { value: "separator", label: "Separateur/Titre",   icon: "—" },
];

export const CONDITION_OPERATORS = [
  { value: "eq",       label: "egal a" },
  { value: "neq",      label: "different de" },
  { value: "contains", label: "contient" },
];

export const FORM_EDITOR_DRAFT_KEY = "inside_odc_form_editor_draft_v1";

export const EDITOR_TABS = [
  { id: "champs",    label: "Champs" },
  { id: "apparence", label: "Apparence" },
  { id: "settings",  label: "Parametres" },
  { id: "reponses",  label: "Reponses" },
];
