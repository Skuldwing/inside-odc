export function defaultSettings() {
  return {
    primary_color: "#0f766e",
    logo_url: "",
    header_image_url: "",
    open_at: null,
    close_at: null,
    submit_label: "Envoyer",
    success_message: "Merci, votre réponse a été enregistrée.",
    redirect_url: "",
    max_submissions: 0,
    one_per_email: false,
    notification_email: "",
  };
}

export function isoToLocalDateTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function localDateTimeToIso(localValue) {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function createField(type = "text", idx = 1) {
  return {
    key: type === "separator" ? `sep_${idx}` : `champ_${idx}`,
    label: type === "separator" ? `Section ${idx}` : `Champ ${idx}`,
    type,
    required: false,
    placeholder: "",
    help_text: "",
    default_value: "",
    options: [],
    page: 1,
    col_span: "full",
    min: "",
    max: "",
    min_length: "",
    max_length: "",
    show_if: null,   // { logic:"AND"|"OR", rules:[{key,operator,value}] }
    jump_rules: [],  // [{ value, page }]
  };
}

/* Migrate a field loaded from DB (old or new format) into the editor schema */
export function migrateField(f, idx) {
  const base = {
    ...createField("text", idx + 1),
    ...f,
    page: Number(f?.page) > 0 ? Number(f.page) : 1,
    jump_rules: Array.isArray(f?.jump_rules) ? f.jump_rules : [],
  };

  // Migrate old single-rule show_if: { key, operator, value }
  // to new multi-rule: { logic:"AND", rules:[...] }
  if (f?.show_if && typeof f.show_if === "object") {
    if (Array.isArray(f.show_if.rules)) {
      base.show_if = f.show_if; // already new format
    } else if (f.show_if.key) {
      base.show_if = {
        logic: "AND",
        rules: [{
          key: String(f.show_if.key),
          operator: String(f.show_if.operator || "eq"),
          value: String(f.show_if.value ?? ""),
        }],
      };
    } else {
      base.show_if = null;
    }
  }

  return base;
}

export function formatDate(isoString) {
  if (!isoString) return "-";
  return new Date(isoString).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function createEditor() {
  return {
    id: null,
    title: "",
    description: "",
    status: "draft",
    slug: "",
    submissions_count: 0,
    fields: [createField("text", 1)],
    settings: defaultSettings(),
  };
}
