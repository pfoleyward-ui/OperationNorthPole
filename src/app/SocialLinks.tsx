import {
  socialAccounts,
  type SocialAccount,
  type SocialPlatform,
} from "../config/contact";
import styles from "./page.module.css";

const platforms: Record<
  SocialPlatform,
  { name: string; hosts: string[]; icon: string }
> = {
  facebook: {
    name: "Facebook",
    hosts: ["facebook.com", "www.facebook.com"],
    icon: "M24 12a12 12 0 1 0-13.875 11.855v-8.386H7.078V12h3.047V9.356c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953h-1.513c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.469h-2.796v8.386A12.003 12.003 0 0 0 24 12Z",
  },
  instagram: {
    name: "Instagram",
    hosts: ["instagram.com", "www.instagram.com"],
    icon: "M7 1h10a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6H7a6 6 0 0 1-6-6V7a6 6 0 0 1 6-6Zm0 2a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4H7Zm5 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm6-3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
  },
  youtube: {
    name: "YouTube",
    hosts: ["youtube.com", "www.youtube.com", "youtu.be"],
    icon: "M23 7s-.2-2-1-3c-.9-.9-1.9-.9-2.4-1C16.2 2.7 12 2.7 12 2.7s-4.2 0-7.6.3c-.5.1-1.5.1-2.4 1C1.2 5 .9 7 .9 7S.7 9.3.7 11.6v2.2C.7 16 .9 18 .9 18s.3 2 1.1 3c.9.9 2.1.9 2.7 1 2 .2 7.3.3 7.3.3s4.2 0 7.6-.3c.5-.1 1.5-.1 2.4-1 .8-1 1-3 1-3s.3-2.3.3-4.5v-2.2C23.3 9 23 7 23 7ZM9.5 16.5v-8l7 4-7 4Z",
  },
  tiktok: {
    name: "TikTok",
    hosts: ["tiktok.com", "www.tiktok.com"],
    icon: "M16 1h-4v15a3 3 0 1 1-3-3h1V9H9a7 7 0 1 0 7 7V8a10 10 0 0 0 6 2V6a6 6 0 0 1-6-5Z",
  },
};

function isVisible(account: SocialAccount) {
  if (!account.active || !account.verified) return false;
  try {
    const url = new URL(account.url);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      platforms[account.platform].hosts.includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function SocialLinks({
  accounts = socialAccounts,
}: {
  accounts?: readonly SocialAccount[];
}) {
  const visible = accounts.filter(isVisible);
  if (!visible.length) return null;
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
      <div className={styles.socialAccounts}>
        {visible.map((account) => (
          <a
            key={account.platform}
            className={styles.facebookCard}
            href={account.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d={platforms[account.platform].icon} />
            </svg>
            <span>
              <span className={styles.socialPlatform}>
                FIND SANTABLIZARD ON
              </span>
              <strong>{platforms[account.platform].name}</strong>
              <span className={styles.socialVisit}>
                Visit Santa’s {platforms[account.platform].name} page
              </span>
              <span className={styles.socialNewTab}>Opens in a new tab</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
