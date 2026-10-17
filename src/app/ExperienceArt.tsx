import Image from "next/image";
import styles from "./page.module.css";

export function ExperienceArt({ kind }: { kind: string }) {
  if (kind === "home" || kind === "summer" || kind === "photography") {
    return (
      <Image
        src={
          kind === "home"
            ? "/images/christmas-village.png"
            : kind === "photography"
              ? "/images/santa-family.jpg"
              : "/images/santa-summer.jpg"
        }
        alt=""
        fill
        sizes="(max-width: 600px) 45vw, 20vw"
        className={styles.cardPhoto}
        style={kind === "summer" ? { objectPosition: "center top" } : undefined}
      />
    );
  }
  const position = kind === "music" ? "0%" : kind === "camera" ? "50%" : "100%";
  return (
    <span
      aria-hidden="true"
      className={styles.cardIllustration}
      style={{ backgroundPosition: `${position} center` }}
    />
  );
}
