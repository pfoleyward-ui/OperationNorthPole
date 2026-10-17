import styles from "./page.module.css";

const facebookUrl = "https://www.facebook.com/profile.php?id=61584693927127";

export function SocialLinks() {
  return (
    <section
      className={styles.social}
      aria-labelledby="social-title"
      id="social"
    >
      <div className={styles.socialIntro}>
        <p className={styles.sectionOverline}>A LITTLE MAGIC BETWEEN VISITS</p>
        <h2 id="social-title">Keep in Touch with Santa</h2>
        <p>
          There’s always room for a little more Christmas. Come say hello on
          Facebook.
        </p>
      </div>
      <a
        className={styles.facebookCard}
        href={facebookUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M24 12a12 12 0 1 0-13.875 11.855v-8.386H7.078V12h3.047V9.356c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953h-1.513c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.469h-2.796v8.386A12.003 12.003 0 0 0 24 12Z"
          />
        </svg>
        <span>
          <span className={styles.socialPlatform}>FIND SANTABLIZARD ON</span>
          <strong>Facebook</strong>
          <span className={styles.socialVisit}>
            Visit Santa’s Facebook page
          </span>
          <span className={styles.socialNewTab}>Opens in a new tab</span>
        </span>
      </a>
    </section>
  );
}
