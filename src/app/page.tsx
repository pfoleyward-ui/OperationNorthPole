import Image from "next/image";
import styles from "./page.module.css";
import { ExperienceArt } from "./ExperienceArt";
import { SocialLinks } from "./SocialLinks";

const experiences = [
  {
    title: "Home Visits",
    detail: "A little North Pole magic, right at your door.",
    kind: "home",
    href: "mailto:santablizard@gmail.com?subject=SantaBlizard%20experience%20inquiry",
  },
  {
    title: "Christmas in July",
    detail: "A touch of Christmas, whatever the season.",
    kind: "summer",
    href: "mailto:santablizard@gmail.com?subject=SantaBlizard%20experience%20inquiry",
  },
  {
    title: "DJ Santa",
    detail: "Music, merriment, and holiday celebrations.",
    kind: "music",
    href: "mailto:santablizard@gmail.com?subject=SantaBlizard%20experience%20inquiry",
  },
  {
    title: "Photo Booths",
    detail: "Picture-perfect memories worth keeping.",
    kind: "camera",
    href: "mailto:santablizard@gmail.com?subject=SantaBlizard%20experience%20inquiry",
  },
  {
    title: "Elves & More",
    detail: "Special touches for unforgettable events.",
    kind: "elves",
    href: "mailto:santablizard@gmail.com?subject=SantaBlizard%20experience%20inquiry",
  },
];

export default function Home() {
  return (
    <main className={styles.site} id="top">
      <div className={styles.snow} aria-hidden="true" />
      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="SantaBlizard home">
          <span className={styles.brandName}>SantaBlizard</span>
          <span className={styles.brandLocation}>HUDSON VALLEY · NEW YORK</span>
        </a>
        <nav className={styles.nav} aria-label="Main navigation">
          <a href="#top">Home</a>
          <a href="#experiences">Experiences</a>
          <a href="#about">About Santa</a>
          <a href="#memories">Memories</a>
        </nav>
        <a
          className={styles.navCta}
          href="mailto:santablizard@gmail.com?subject=An%20invitation%20for%20Santa"
        >
          Invite Santa to Visit
        </a>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroAtmosphere} aria-hidden="true" />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>A LITTLE MAGIC IN THE HUDSON VALLEY</p>
          <h1 id="hero-title">
            Well, Well, Well…
            <br />
            Look Who Found Me.
          </h1>
          <div className={styles.flourish} aria-hidden="true">
            ✦ ─── ✦ ─── ✦
          </div>
          <p className={styles.heroCopy}>
            Some secrets are too wonderful to keep. Bring the magic of
            SantaBlizard to your home, event, or celebration.
          </p>
          <div className={styles.actions}>
            <a
              className={styles.primaryButton}
              href="mailto:santablizard@gmail.com?subject=An%20invitation%20for%20Santa"
            >
              Invite Santa to Visit <span aria-hidden="true">→</span>
            </a>
            <a className={styles.secondaryButton} href="#about">
              Meet Santa
            </a>
          </div>
        </div>
        <div className={styles.heroPortrait}>
          <Image
            src="/images/santa-cutout.png"
            alt="SantaBlizard in his traditional red velvet Santa suit"
            fill
            priority
            sizes="(max-width: 700px) 90vw, 50vw"
            className={styles.santaImage}
          />
        </div>
        <div className={styles.heroBottom} aria-hidden="true" />
      </section>

      <section
        id="experiences"
        className={styles.experiences}
        aria-labelledby="experiences-title"
      >
        <h2 id="experiences-title">
          <span aria-hidden="true">❧ </span>SantaBlizard Experiences
          <span aria-hidden="true"> ❧</span>
        </h2>
        <div className={styles.cards}>
          {experiences.map((item) => (
            <a className={styles.card} href={item.href} key={item.title}>
              <span className={styles.cardArt}>
                <ExperienceArt kind={item.kind} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <span className={styles.cardArrow} aria-hidden="true">
                →
              </span>
            </a>
          ))}
        </div>
      </section>

      <section
        className={styles.about}
        id="about"
        aria-labelledby="about-title"
      >
        <div className={styles.aboutImage}>
          <Image
            src="/images/santa-peeking.jpg"
            alt="SantaBlizard looking around a tree in the winter"
            fill
            sizes="(max-width: 700px) 100vw, 50vw"
          />
        </div>
        <div className={styles.aboutText}>
          <p className={styles.sectionOverline}>MEET SANTABLIZARD</p>
          <h2 id="about-title">
            The Man Behind
            <br />
            the Magic
          </h2>
          <p>
            Some traditions are too special to leave at the North Pole.
            SantaBlizard brings warmth, wonder, and a twinkle of mischief to
            gatherings throughout the Hudson Valley.
          </p>
          <a
            className={styles.primaryButton}
            href="mailto:santablizard@gmail.com?subject=An%20invitation%20for%20Santa"
          >
            Invite Santa into Your Story →
          </a>
        </div>
      </section>

      <section
        className={styles.memories}
        id="memories"
        aria-labelledby="memories-title"
      >
        <div>
          <p className={styles.sectionOverline}>
            THE MOMENTS THAT MAKE CHRISTMAS MAGICAL
          </p>
          <h2 id="memories-title">
            More Than a Visit.
            <br />A Memory for a Lifetime.
          </h2>
          <p>
            From whispered wishes to the biggest belly laughs, it’s the moments
            together that become family traditions.
          </p>
          <a className={styles.primaryButton} href="#experiences">
            Explore the Experiences →
          </a>
        </div>
        <div className={styles.memoriesImage}>
          <Image
            src="/images/santa-family.jpg"
            alt="SantaBlizard sharing a Christmas moment with a child"
            fill
            sizes="(max-width: 700px) 100vw, 50vw"
          />
        </div>
      </section>

      <SocialLinks />

      <footer className={styles.footer} id="contact">
        <p className={styles.footerTitle}>
          Have a little Christmas magic in mind?
        </p>
        <p>
          Tell Santa a little about your gathering, where it will be, and when
          you have in mind. Let’s begin with an email.
        </p>
        <a className={styles.emailLink} href="mailto:santablizard@gmail.com">
          santablizard@gmail.com
        </a>
        <a href="#top">Back to the North Pole ↑</a>
        <small>
          © {new Date().getFullYear()} SantaBlizard · Hudson Valley, New York
        </small>
      </footer>
    </main>
  );
}
