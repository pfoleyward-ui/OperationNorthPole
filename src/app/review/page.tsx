import type { Metadata } from "next";
import styles from "./review.module.css";

export const metadata: Metadata = {
  title: "SantaBlizard visual review",
  robots: { index: false, follow: false },
};

export default function VisualReview() {
  return (
    <main className={styles.review}>
      <h1>SantaBlizard visual review</h1>
      <p>
        Actual browser screenshots of the website. Open an image to inspect it
        at full size. This page is a review gallery, not the homepage.
      </p>
      <p>
        <a href="/">Open the working homepage</a>
      </p>
      <section>
        <h2>Current desktop and mobile</h2>
        <div className={styles.gallery}>
          <a href="/review/homepage-1024.jpg">
            <img
              src="/review/homepage-1024.jpg"
              alt="Current homepage captured at the 1024-pixel reference viewport"
              width="1024"
              loading="lazy"
            />
            <span>1024px reference width — full page</span>
          </a>
          <a href="/review/homepage-390.jpg">
            <img
              src="/review/homepage-390.jpg"
              alt="Current mobile homepage captured at 390 pixels wide"
              width="390"
              loading="lazy"
            />
            <span>390px mobile — full page</span>
          </a>
        </div>
        <p>
          Additional widths: <a href="/review/homepage-768.jpg">768px tablet</a>{" "}
          · <a href="/review/homepage-1440.jpg">1440px desktop</a> ·{" "}
          <a href="/review/homepage-1920.jpg">1920px wide desktop</a>
        </p>
      </section>
      <section>
        <h2>Services &amp; Pricing</h2>
        <p><a href="/services">Explore the Services page</a></p>
        <p><a href="/review/services-390.jpg">390px mobile screenshot</a> · <a href="/review/services-1024.jpg">1024px desktop screenshot</a> · <a href="/review/services-report.json">Validation report</a></p>
      </section>
      <section>
        <h2>Before and after</h2>
        <p>
          The comparison below uses the previous website, not the approved
          rendering. Both sides show the first 1024 × 1536 pixels without
          stretching.
        </p>
        <a href="/review/baseline-side-by-side.jpg">
          <img
            className={styles.comparison}
            src="/review/baseline-side-by-side.jpg"
            alt="Previous website on the left and refined website on the right"
            width="2048"
            loading="lazy"
          />
        </a>
        <p>
          <a href="/review/baseline-overlay-50.jpg">50% before/after overlay</a>{" "}
          ·{" "}
          <a href="/review/baseline-difference.png">
            Before/after pixel difference
          </a>
        </p>
      </section>
      <section>
        <h2>Approved-reference comparison</h2>
        <p>
          Pending the original 1024 × 1536 render file. The render can be seen
          in the project conversation, but its downloadable file was not
          available for an exact overlay. The before/after images above must not
          be treated as evidence of a pixel-perfect reference match.
        </p>
        <p>
          The new approved greeting is substantially longer, so the hero is
          taller. Workshop artwork is an owner-authorized generated scene based
          on the supplied SantaBlizard photographs. The authentic
          Santa-and-child photograph remains unchanged.
        </p>
      </section>
    </main>
  );
}
