import Image from "next/image";
import styles from "./page.module.css";

export function ExperienceArt({ kind }: { kind: string }) {
  if (kind === "home" || kind === "summer") {
    return (
      <Image
        src={
          kind === "home"
            ? "/images/christmas-village.png"
            : "/images/santa-summer.jpg"
        }
        alt=""
        fill
        sizes="(max-width: 600px) 45vw, 20vw"
        className={styles.cardPhoto}
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
