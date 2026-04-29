export function defaultSettings() {
  return {
    primary_color: "#0f766e",
    logo_url: "",
    header_image_url: "",
    open_at: null,
    close_at: null,
    submit_label: "Envoyer",
    success_message: "Merci, votre reponse a ete enregistree.",
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
    options: [],
    page: 1,
    show_if: null,
  };
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
