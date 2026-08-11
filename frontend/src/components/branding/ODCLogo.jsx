import odcLogoFull from "./odc-logo-full.png";
import odcLogoMark from "./odc-logo-mark.png";

export default function ODCLogo({
  variant = "full",
  className = "",
  title = "Orange Digital Center Sonatel",
}) {
  const src = variant === "mark" ? odcLogoMark : odcLogoFull;

  return <img src={src} alt={title} className={`object-contain ${className}`} />;
}
