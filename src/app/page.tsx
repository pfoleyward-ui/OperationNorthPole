import Image from "next/image";
import styles from "./page.module.css";
import { ExperienceArt } from "./ExperienceArt";
import { SocialLinks } from "./SocialLinks";
import { contact } from "../config/contact";

const invitationHref = `mailto:${contact.email}?subject=${encodeURIComponent("An invitation for Santa")}`;
const experienceHref = `mailto:${contact.email}?subject=${encodeURIComponent("SantaBlizard experience inquiry")}`;

const experiences = [
  {
    title: "Home Visits",
    detail: "Christmas memories, right at your door.",
    kind: "home",
    href: experienceHref,
  },
  {
    title: "Christmas in July",
    detail: "A little Christmas in the summertime.",
    kind: "summer",
    href: experienceHref,
  },
  {
    title: "DJ Santa",
    detail: "Music, merriment & holiday fun.",
    kind: "music",
    href: experienceHref,
  },
  {
    title: "Photo Booths",
    detail: "Capture a little Christmas magic.",
    kind: "camera",
    href: experienceHref,
  },
  {
    title: "Elves & More",
    detail: "Special touches for your celebration.",
    kind: "elves",
    href: experienceHref,
  },
];

function SnowySeam() {
  return <div className={styles.sectionSeam} aria-hidden="true" />;
}

export default function Home() {
  return (
    <main className={styles.site} id="top">
      <div className={styles.snow} aria-hidden="true" />
      <div className={styles.openingBoughs} aria-hidden="true" />
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
        <a className={styles.navCta} href={invitationHref}>
          Invite Santa to Visit
        </a>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroAtmosphere} aria-hidden="true" />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>
            A Little North Pole Magic, Right Here at Home
          </p>
          <h1 id="hero-title">
            <span>Ho Ho Ho! </span>
            <span>You Found Me! </span>
            <span className={styles.heroPunchline}>
              I Knew I Should've Hidden Behind a Bigger Tree!
            </span>
          </h1>
          <div className={styles.flourish} aria-hidden="true">
            ──── ❦ ────
          </div>
          <p className={styles.heroCopy}>
            Since you've found your way to my little corner of the North Pole,
            perhaps it's time I found my way to yours. What do you say we make a
            little Christmas magic together?
          </p>
          <div className={styles.actions}>
            <a className={styles.primaryButton} href={invitationHref}>
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
            preload
            sizes="(max-width: 700px) 100vw, (max-width: 850px) 47vw, (max-width: 1440px) 43vw, 620px"
            className={styles.santaImage}
          />
        </div>
        <div className={styles.northPoleSign} aria-hidden="true">
          North Pole<span>This Way</span>
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

      <SnowySeam />
      <section
        className={styles.about}
        id="about"
        aria-labelledby="about-title"
      >
        <div className={styles.aboutImage}>
          <Image
            src="/images/santa-workshop.webp"
            alt="Illustrated SantaBlizard writing with a quill at an antique desk in his candlelit Christmas workshop"
            fill
            sizes="(max-width: 700px) 92vw, (max-width: 1440px) 58vw, 850px"
          />
        </div>
        <div className={styles.aboutText}>
          <p className={styles.sectionOverline}>MEET SANTABLIZARD</p>
          <h2 id="about-title">
            The Man Behind
            <br />
            the Magic
          </h2>
          <div className={styles.paperFlourish} aria-hidden="true">
            ──── ❦ ────
          </div>
          <p>
            Some traditions are too special to leave at the North Pole. Join
            SantaBlizard for warmth, wonder, and a little Christmas mischief
            here in the Hudson Valley.
          </p>
          <a className={styles.primaryButton} href={invitationHref}>
            Invite Santa into Your Story →
          </a>
        </div>
      </section>

      <SnowySeam />
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
        <div className={styles.memoriesPhotoGroup}>
          <div className={styles.memoriesImage}>
            <Image
              src="/images/santa-family.jpg"
              alt="SantaBlizard sharing a Christmas moment with a child"
              fill
              sizes="(max-width: 700px) 76vw, (max-width: 1440px) 43vw, 620px"
            />
          </div>
          <div className={styles.memoryLantern} aria-hidden="true" />
          <aside className={styles.christmasNote}>
            Christmas wishes,<span>SantaBlizard</span>
          </aside>
        </div>
      </section>

      <SnowySeam />
      <footer className={styles.footer} id="contact">
        <div className={styles.correspondenceLetter}>
          <p className={styles.footerTitle}>
            Have a little Christmas magic in mind?
          </p>
          <p>
            Tell Santa a little about your gathering, where it will be, and when
            you have in mind. Let’s begin with an email.
          </p>
          <address className={styles.contactDetails}>
            <a href={contact.phoneHref}>{contact.phone}</a>
            <a className={styles.emailLink} href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          </address>
          <a href="#top">Back to the North Pole ↑</a>
        </div>
        <SocialLinks />
        <small>
          © {new Date().getFullYear()} SantaBlizard · Hudson Valley, New York
        </small>
      </footer>
    </main>
  );
}
