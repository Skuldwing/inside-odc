import Modal from "../ui/Modal";

/**
 * Conserve pour ne pas toucher aux cinq pages qui l'utilisent : ce n'est plus
 * qu'une facade au-dessus de <Modal>, qui apporte Echap, le piege de focus,
 * la restitution du focus et les roles ARIA.
 *
 * Corrige au passage un defaut de l'ancienne version : elle imposait
 * `height: calc(100dvh - 3rem)`, ce qui etirait une petite fiche sur toute la
 * hauteur de l'ecran. La hauteur suit desormais le contenu.
 *
 * Les nouveaux ecrans utilisent directement <Modal>.
 */
export default function AdminModal({ title, onClose, children, maxWidth = "max-w-lg" }) {
  return (
    <Modal open onClose={onClose} title={title} maxWidth={maxWidth}>
      {children}
    </Modal>
  );
}
