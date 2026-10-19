import type { Metadata } from "next";
import { services, santaNote, completeParty } from "../../config/services";
import { contact } from "../../config/contact";
import { ExperienceArt } from "../ExperienceArt";
import shared from "../page.module.css";
import styles from "./services.module.css";

export const metadata: Metadata = {
  title: "Services & Pricing | SantaBlizard",
  description: "Home visits, photography studio days, DJ Santa, staffed photo booths, and off-season appearances in the Hudson Valley. Explore base prices and inquire with SantaBlizard.",
};
const inquire = (service: string) => `mailto:${contact.email}?subject=${encodeURIComponent(`SantaBlizard inquiry: ${service}`)}`;

export default function ServicesPage() {
  return (
    <main className={`${shared.site} ${styles.services}`}>
      <header className={styles.heading}>
        <a className={styles.home} href="/">← Back to SantaBlizard's North Pole</a>
        <p className={shared.sectionOverline}>A LITTLE CHRISTMAS MAGIC FOR EVERY OCCASION</p>
        <h1>SantaBlizard Services & Pricing</h1>
        <p>From a knock at your front door to a whole room full of Christmas cheer, let's find the right little bit of magic for you.</p>
        <nav aria-label="Service destinations" className={styles.navigation}>
          {services.map(service => <a key={service.id} href={`#${service.id}`}>{service.title}</a>)}
        </nav>
      </header>
      <aside className={styles.booking} aria-labelledby="booking-notes">
        <h2 id="booking-notes">A Little Note from the Elves</h2>
        <p>All listed prices are base prices. Santa travels from Blooming Grove, NY. Travel, staffing, equipment logistics, and unusual venue requirements may affect your final quote. We'll confirm everything with you before your booking is official!</p>
        <p><strong>All bookings require confirmation.</strong> A requested date or time does not guarantee availability. <strong>Santa is unavailable on Christmas Eve and Christmas Day.</strong></p>
      </aside>
      {services.map(service => (
        <section key={service.id} id={service.id} className={styles.section} aria-labelledby={`${service.id}-title`}>
          <div className={styles.serviceHeader}>
            <div className={styles.art}><ExperienceArt kind={service.kind} /></div>
            <div>
              <h2 id={`${service.id}-title`}>{service.title}</h2>
              <p className={styles.price}>{service.price} <span>· Base price</span></p>
              <h3>{service.id === "off-season" ? "Who Says Santa Only Works in December?" : service.headline}</h3>
            </div>
          </div>
          <p>{service.story}</p>
          <h3>{service.id === "off-season" ? "A few excuses to leave the workshop" : "Your experience includes"}</h3>
          <ul>{service.includes.map(item => <li key={item}>{item}</li>)}</ul>
          {service.id === "home-visits" && <aside className={styles.santaNote}><h3>A Little Note from Santa</h3><p>“{santaNote}”</p></aside>}
          <aside className={styles.elvesNote}><h3>A Little Note from the Elves</h3><p>{service.note} All bookings are subject to confirmation and the base-price conditions above.</p></aside>
          <a className={shared.primaryButton} href={inquire(service.title)}>{service.cta} →</a>
          {service.id === "dj-parties" && (
            <section className={styles.party} aria-labelledby="complete-party-title" id="complete-party">
              <p className={shared.sectionOverline}>THE COMPLETE SANTABLIZARD CHRISTMAS PARTY</p>
              <h3 id="complete-party-title">{completeParty.headline}</h3>
              <p className={styles.price}>{`${completeParty.price} `}<span>· Base price</span></p>
              <p>{completeParty.description}</p>
              <ul>
                {completeParty.includes.map(item => <li key={item}>{item}</li>)}
              </ul>
              <aside className={styles.elvesNote}><h4>A Little Note from the Elves</h4><p>The photo booth requires an attendant. Staffing and availability must be verified before confirming your booking, so Santa can focus on DJ and MC duties while the attendant operates the booth. The base-price and availability conditions above apply.</p></aside>
              <a className={shared.primaryButton} href={inquire("Complete SantaBlizard Christmas Party")}>Bring the North Pole to Your Party →</a>
            </section>
          )}
        </section>
      ))}
      <footer className={styles.booking}>
        <h2>Shall We Make a Little Christmas Magic?</h2>
        <p>Tell Santa about your event, location, and preferred date. Your inquiry starts a conversation; it does not confirm a booking.</p>
        <address><a href={contact.phoneHref}>{contact.phone}</a> · <a href={`mailto:${contact.email}`}>{contact.email}</a></address>
        <a className={styles.home} href="/">Return to the North Pole ↑</a>
      </footer>
    </main>
  );
}
