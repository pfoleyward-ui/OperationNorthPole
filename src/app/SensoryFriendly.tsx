import { sensoryFriendly } from "../config/sensory";
import styles from "./sensory.module.css";
export function SensoryFriendly({ compact = false }: { compact?: boolean }) {
  return <aside className={`${styles.panel} ${compact ? styles.compact : ""}`} aria-label={sensoryFriendly.title}>
    <p className={styles.overline}>A WARM WELCOME FOR EVERY CHILD</p>
    <h2>{sensoryFriendly.title}</h2>
    <p className={styles.introduction}>{sensoryFriendly.introduction}</p>
    <p>{sensoryFriendly.description}</p>
    <p><strong>{sensoryFriendly.priceNote}</strong></p>
    {!compact && <p>{sensoryFriendly.privacyNote}</p>}
  </aside>;
}
