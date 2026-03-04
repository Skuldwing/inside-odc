export default function ODCLogo({
  variant = "full",
  className = "",
  title = "Orange Digital Center Sonatel",
}) {
  if (variant === "mark") {
    return (
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label={title}
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>{title}</title>
        <rect x="4" y="4" width="56" height="56" rx="8" fill="#FF7900" />
        <rect x="14" y="30" width="36" height="6" rx="3" fill="#F2F2F2" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 940 220"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <text
        x="10"
        y="58"
        fill="#FF7900"
        fontSize="56"
        fontWeight="700"
        fontFamily="'Plus Jakarta Sans', 'Segoe UI', sans-serif"
      >
        Orange Digital Center
      </text>
      <text
        x="10"
        y="202"
        fill="#0AA5A5"
        fontSize="150"
        fontWeight="400"
        letterSpacing="1.5"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        sonatel
      </text>
      <rect x="760" y="58" width="160" height="144" fill="#FF7900" />
      <rect x="792" y="122" width="96" height="16" fill="#F2F2F2" />
    </svg>
  );
}
