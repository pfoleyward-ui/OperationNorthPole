"use client";
import { useRef, useState } from "react";
import { basePriceForDuration, bookableServices, meetGreetPricing, usd, type ServiceId } from "../../config/services";
import { sensoryFriendly } from "../../config/sensory";
import { serviceQuestions } from "../../domain/booking/questions";
import { validateBookingRequest, type TimingInput, type Issue } from "../../domain/booking/request";
import { bookingSubmissionAvailability } from "../../domain/booking/submission";
import { BOOKING_TIME_ZONE, resolveWallTime } from "../../domain/booking/time";
import { demoAnswers, demoCustomer, demoLocation, demoGuestCount, demoFlexibility, demoInstructions } from "./demo";
import shared from "../page.module.css";
import styles from "./book.module.css";
const steps = ["Experience", "When & Where", "Customer Details", "Review & Send"];
function issueMessage(issue: Issue): string {
  const field = issue.path.startsWith("alternative") ? "alternative visit" : "preferred visit";
  switch (issue.code) {
    case "christmas_unavailable": case "unavailable_interval": return `Santa is unavailable on Christmas Eve and Christmas Day. Choose another date or time for your ${field}.`;
    case "invalid_date_or_time": case "invalid": return `Choose a valid date and time for your ${field}.`;
    case "nonexistent": return "That time does not occur in New York because the clocks move forward. Please choose another time.";
    case "ambiguous_time": return "That time occurs twice when the clocks move back. Choose the first or second occurrence.";
    case "past_time": return `Choose a future date and time for your ${field}.`;
    case "reversed_window": return "The latest start must be at or after the earliest start.";
    case "invalid_duration": case "invalid_service_duration": return "Choose a valid duration. Meet & Greet visits start at one hour, with 30-minute extensions.";
    default: return "Please review your selections before continuing with this practice letter.";
  }
}
export function BookingWizard({ initialService, unknownService }: { initialService: ServiceId; unknownService: boolean }) {
  const [service, setService] = useState<ServiceId>(initialService);
  const [step, setStep] = useState(0);
  const [preferred, setPreferred] = useState<TimingInput>({ date: "", time: "" });
  const [alternative, setAlternative] = useState<TimingInput>({ date: "", time: "" });
  const [useAlternative, setUseAlternative] = useState(false);
  const [useWindow, setUseWindow] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [sensory, setSensory] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [complete, setComplete] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const selected = bookableServices[service];
  const duration = selected.durationMinutes ?? minutes;
  let base: number = selected.basePriceCents;
  try { base = basePriceForDuration(service, duration); } catch { /* Validation reports invalid durations. */ }
  const payload = () => ({ serviceId: service, timing: { ...preferred, latestTime: useWindow ? preferred.latestTime : undefined, latestDisambiguation: useWindow ? preferred.latestDisambiguation : undefined }, ...(useAlternative ? { alternative } : {}), ...(selected.durationMinutes === null ? { durationMinutes: minutes } : {}), customer: demoCustomer, location: demoLocation, eventType: "Sample event", answers: demoAnswers(service), guestCount: demoGuestCount, flexibility: demoFlexibility, instructions: demoInstructions, sensoryFriendly: sensory });
  function move(next: number) {
    setStep(next); setIssues([]);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function next() {
    const result = validateBookingRequest(payload(), Date.now());
    const relevant = result.ok === true ? [] : result.issues.filter(issue => step === 0 ? issue.path.startsWith("duration") : step === 1 ? issue.path.startsWith("timing") || issue.path.startsWith("alternative") : true);
    if (relevant.length) { setIssues(relevant); return; }
    move(step + 1);
  }
  function finish() {
    const result = validateBookingRequest(payload(), Date.now());
    if (result.ok === false) { setIssues(result.issues); return; }
    // A test receipt only. The unavailable persistence gate cannot produce a received result.
    if (bookingSubmissionAvailability().kind === "unavailable") { setComplete(true); requestAnimationFrame(() => heading.current?.focus()); }
  }
  function timingFields(value: TimingInput, update: (v: TimingInput) => void, prefix: string, window = false) {
    const ambiguous = resolveWallTime(value.date, value.time).kind === "ambiguous";
    const latestAmbiguous = window && resolveWallTime(value.date, value.latestTime).kind === "ambiguous";
    return <div className={styles.fields}>
      <label>{prefix} date<input type="date" value={value.date} onChange={e => update({ ...value, date: e.target.value, disambiguation: undefined, latestDisambiguation: undefined })} /></label>
      <label>{window ? `${prefix} earliest start` : `${prefix} time`}<input type="time" value={value.time} onChange={e => update({ ...value, time: e.target.value, disambiguation: undefined })} /></label>
      {ambiguous && <label>{prefix} repeated time<select aria-label={`${prefix} repeated time`} value={value.disambiguation ?? ""} onChange={e => update({ ...value, disambiguation: e.target.value as "earlier" | "later" })}><option value="">Choose which occurrence</option><option value="earlier">First occurrence (daylight time)</option><option value="later">Second occurrence (standard time)</option></select></label>}
      {window && <label>{prefix} latest start<input type="time" value={value.latestTime ?? ""} onChange={e => update({ ...value, latestTime: e.target.value, latestDisambiguation: undefined })} /></label>}
      {latestAmbiguous && <label>{prefix} latest repeated time<select aria-label={`${prefix} latest repeated time`} value={value.latestDisambiguation ?? ""} onChange={e => update({ ...value, latestDisambiguation: e.target.value as "earlier" | "later" })}><option value="">Choose which occurrence</option><option value="earlier">First occurrence (daylight time)</option><option value="later">Second occurrence (standard time)</option></select></label>}
    </div>;
  }
  return <main className={`${shared.site} ${styles.site}`}>
    <div className={styles.paper}>
      <a href="/services">← Back to SantaBlizard's Services</a>
      <p className={shared.sectionOverline}>A LETTER TO THE NORTH POLE</p>
      <h1>Plan a Visit with Santa</h1>
      <aside className={styles.notice} aria-label="Booking preview status"><strong>Test preview — not accepting booking requests.</strong><p>Use sample details only. Contact and location fields are locked to fictional examples. Nothing is sent, saved, or booked. Please use the existing contact options on the Services page for a real inquiry.</p></aside>
      {unknownService && <p role="status">That service was not recognized. Please choose an experience below.</p>}
      {!complete && <>
        <ol className={styles.steps} aria-label="Booking steps">{steps.map((label, i) => <li key={label} aria-current={step === i ? "step" : undefined}>{i + 1}. {label}</li>)}</ol>
        <h2 ref={heading} tabIndex={-1}>{steps[step]}</h2>
        {issues.length > 0 && <div role="alert" className={styles.errors}><strong>Please check your practice letter.</strong><ul>{issues.map((issue, i) => <li key={`${issue.path}-${i}`}>{issueMessage(issue)}</li>)}</ul><p>Dates use New York time. Christmas Eve and Christmas Day are unavailable.</p></div>}
        {step === 0 && <>
          <label>Choose your experience<select value={service} onChange={e => { setService(e.target.value as ServiceId); setMinutes(60); setIssues([]); }}>{Object.entries(bookableServices).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}</select></label>
          <p>{selected.description}</p>
          <p className={styles.price}>{usd(base)} starting price · {duration} minutes</p>
          {selected.durationMinutes === null && <label>{service === "trivia" ? "Proposed session duration (minutes; subject to agreement)" : "Visit duration (minutes; one-hour minimum, then 30-minute extensions)"}<input type="number" min={service === "meet-greet" ? 60 : 1} step={service === "meet-greet" ? 30 : 1} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label>}
          {service === "meet-greet" && <p>{usd(selected.basePriceCents)} minimum for one hour, plus {usd(meetGreetPricing.incrementCents)} per additional {meetGreetPricing.incrementMinutes} minutes.</p>}
          {service === "trivia" && <p>Santa Trivia is {usd(selected.basePriceCents)} per session. Duration and event requirements must be agreed upon before confirmation.</p>}
          <label className={styles.checkbox}><input type="checkbox" checked={sensory} onChange={e => setSensory(e.target.checked)} />I prefer a sensory-friendly interaction (optional)</label>
          <p>{sensoryFriendly.priceNote} No diagnosis or private child details are needed.</p>
        </>}
        {step === 1 && <>
          <p>All dates and times use {BOOKING_TIME_ZONE}. A preferred time is a request, not verified availability. Santa is unavailable on Christmas Eve and Christmas Day.</p>
          <label className={styles.checkbox}><input type="checkbox" checked={useWindow} onChange={e => setUseWindow(e.target.checked)} />Use a preferred start-time window</label>
          {timingFields(preferred, setPreferred, "Preferred", useWindow)}
          <label className={styles.checkbox}><input type="checkbox" checked={useAlternative} onChange={e => setUseAlternative(e.target.checked)} />Include an alternative date</label>
          {useAlternative && timingFields(alternative, setAlternative, "Alternative")}
          <label>Event location (sample only)<input value={demoLocation} readOnly /></label>
          <label>Scheduling flexibility (sample only)<input value={demoFlexibility} readOnly /></label>
        </>}
        {step === 2 && <>
          <p>These examples are locked until secure persistence and server-side validation are ready. Do not enter real customer or child information.</p>
          <div className={styles.fields}>
            <label>Organizer name (sample only)<input value={demoCustomer.name} readOnly autoComplete="off" /></label>
            <label>Email (sample only)<input type="email" value={demoCustomer.email} readOnly autoComplete="off" /></label>
            <label>Phone (sample only)<input type="tel" value={demoCustomer.phone} readOnly autoComplete="off" /></label>
            <label>Event type (sample only)<input value="Sample event" readOnly /></label>
            <label>Approximate guests (sample only)<input value={demoGuestCount} readOnly /></label>
          </div>
          <fieldset><legend>A little about your {selected.name} experience</legend>{serviceQuestions[service].map(q => <label key={q.key}>{q.label} (sample only)<input readOnly value={(typeof demoAnswers(service)[q.key] === "boolean" ? (demoAnswers(service)[q.key] ? "Yes" : "No") : String(demoAnswers(service)[q.key]))} /></label>)}</fieldset>
          <label>Additional instructions (sample only)<input value={demoInstructions} readOnly /></label>
          <p>{sensoryFriendly.privacyNote} Private preparation notes are deferred; there are no diagnosis, medical, school, or child-name fields.</p>
        </>}
        {step === 3 && <>
          <dl><dt>Experience</dt><dd>{selected.name}</dd><dt>Starting price and duration</dt><dd>{usd(base)} · {duration} minutes</dd><dt>Preferred date/time</dt><dd>{preferred.date} at {preferred.time}{useWindow ? `–${preferred.latestTime}` : ""} ({BOOKING_TIME_ZONE}; {preferred.disambiguation ?? "unambiguous time"})</dd>{useAlternative && <><dt>Alternative</dt><dd>{alternative.date} at {alternative.time} ({alternative.disambiguation ?? "unambiguous time"})</dd></>}<dt>Location</dt><dd>{demoLocation}</dd><dt>Organizer</dt><dd>{demoCustomer.name} · {demoCustomer.email} · {demoCustomer.phone}</dd><dt>Event and guests</dt><dd>Sample event · {demoGuestCount} guests</dd><dt>Flexibility</dt><dd>{demoFlexibility}</dd><dt>Instructions</dt><dd>{demoInstructions}</dd><dt>Experience details</dt><dd>{serviceQuestions[service].map(q => <p key={q.key}>{q.label}: {(typeof demoAnswers(service)[q.key] === "boolean" ? (demoAnswers(service)[q.key] ? "Yes" : "No") : String(demoAnswers(service)[q.key]))}</p>)}</dd><dt>Sensory-friendly preference</dt><dd>{sensory ? "Yes" : "Not selected"}</dd></dl>
          <p>Base prices may change for travel, staffing, equipment logistics, or unusual venue requirements. Any final quote must be agreed upon. All bookings require Santa's review and confirmation; a requested date does not guarantee availability.</p>
          <p><strong>This practice letter cannot be submitted. Nothing will reach Santa.</strong></p>
        </>}
        <div className={styles.actions}>{step > 0 && <button type="button" className={shared.secondaryButton} aria-label="Back" onClick={() => move(step - 1)}>Back</button>}{step < 3 ? <button type="button" className={shared.primaryButton} aria-label="Continue" onClick={next}>Continue</button> : <button type="button" className={shared.primaryButton} aria-label="Check practice letter — nothing sent" onClick={finish}>Check practice letter — nothing sent</button>}</div>
      </>}
      {complete && <section><h2 ref={heading} tabIndex={-1}>Practice Letter Complete — Nothing Sent</h2><p>This was a local demonstration with fictional contact details. No booking request was received, no date was reserved, and no information was saved or transmitted.</p><button type="button" className={shared.primaryButton} onClick={() => { setComplete(false); move(0); }}>Review another example</button></section>}
    </div>
  </main>;
}
