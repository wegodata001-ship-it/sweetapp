import Image from "next/image";
import styles from "./brand-logo.module.css";

const LOGO_SRC = "/logo.png";
const LOGO_ALT = "WEGO BUSINESS";

type BrandLogoMiniProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

/** Cropped mini logo for sidebar, navbar, mobile header */
export function BrandLogoMini({ size = 44, className, priority }: BrandLogoMiniProps) {
  return (
    <span
      className={`${styles.mini} ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden={false}
    >
      <Image
        src={LOGO_SRC}
        alt={LOGO_ALT}
        width={size}
        height={size}
        priority={priority}
        className={styles.miniImage}
      />
    </span>
  );
}

type BrandLogoFullProps = {
  className?: string;
  priority?: boolean;
};

/** Full logo with glow — login & marketing */
export function BrandLogoFull({ className, priority = false }: BrandLogoFullProps) {
  return (
    <div className={`${styles.fullWrap} ${className ?? ""}`}>
      <span className={styles.fullGlow} aria-hidden />
      <Image
        src={LOGO_SRC}
        alt={`${LOGO_ALT} — حلويات القدس`}
        width={420}
        height={420}
        priority={priority}
        className={styles.fullImage}
        sizes="(max-width: 900px) 220px, 340px"
      />
    </div>
  );
}
