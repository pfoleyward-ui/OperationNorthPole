import {contact} from '../../config/contact';
import {legalUpdated,type LegalDocument as Document} from '../../content/legal';
import shared from '../page.module.css';
import styles from './legal.module.css';
export function LegalDocument({document}: {document:Document}) {
  return <main className={`${shared.site} ${styles.site}`}>
    <article className={styles.paper}>
      <header><a href="/">← Back to SantaBlizard</a><p className={styles.eyebrow}>SANTABLIZARD · HUDSON VALLEY, NEW YORK</p><h1>{document.title}</h1><p>Last updated: {legalUpdated}</p></header>
      {document.sections.map(section=><section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map(text=><p key={text}>{text}</p>)}</section>)}
      {document.title==='Privacy Policy'&&<p><a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a> · <a href="https://myaccount.google.com/connections">Manage Google Account connections</a></p>}
      <footer><p>Contact: <a href={`mailto:${contact.email}`}>{contact.email}</a> · <a href={contact.phoneHref}>{contact.phone}</a></p><nav aria-label="Website policies"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="/services">Services &amp; Pricing</a></nav></footer>
    </article>
  </main>;
}
