/** Prepared for owner review. Not approved or published as of November 18, 2026. */
export type LegalDocument = { title: string; description: string; sections: { title: string; paragraphs: string[] }[] };
export const legalUpdated = 'November 18, 2026';
export const privacy: LegalDocument = {
  title: 'Privacy Policy',
  description: 'How SantaBlizard handles inquiries, adult booking information, and its authorized Google Calendar connection.',
  sections: [
    {title: 'Who this policy covers', paragraphs: [
      'SantaBlizard provides Christmas experiences in the Hudson Valley, New York. This policy covers santablizard.com and the booking and scheduling tools used to handle adult inquiries and confirmed visits. Contact SantaBlizard at santablizard@gmail.com or 845-234-2858 with privacy questions.',
      'Booking features are available only when enabled. The public website currently directs inquiries to Santa by email or telephone. Publishing this policy does not enable online booking or optional child-note collection.'
    ]},
    {title: 'Information used for inquiries and bookings', paragraphs: [
      'When you contact Santa or provide booking details, information may include the adult organizer’s name, email address, telephone number, event location, requested dates and times, service, guest counts, optional sensory-friendly preference, and agreed quote or scheduling arrangements. Please provide only information needed to plan the visit; do not send diagnoses, medical information, or private child or family details.',
      'This information is used to respond to inquiries, prepare quotes, record agreed arrangements, manage availability, provide booking updates and reminders when enabled, and protect the service against misuse. An inquiry is not a confirmed booking.'
    ]},
    {title: 'Google Calendar authorization', paragraphs: [
      'SantaBlizard’s scheduling integration asks the authorized calendar owner to connect Google Calendar. It uses Google’s calendar.app.created permission to create and manage a dedicated bookings calendar created by the app. This permission does not grant access to Gmail messages or contacts.',
      'The integration stores the authorized account identifier, an encrypted authorization-token record, and identifiers needed to maintain the dedicated calendar and its booking events. Events use limited appointment and logistical information, such as the service, agreed time, event location, booking reference, and a protected dashboard link. Private child notes do not belong in Calendar entries.',
      'Google user data is used only to provide the authorized booking-calendar functionality. The integration does not sell Google user data or use it for advertising or AI-model training. SantaBlizard’s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.',
      'The authorized calendar owner can disconnect the integration in the private dashboard or revoke its access through Google Account permissions. Revoking authorization stops future authorized Calendar API access; it does not by itself remove existing calendar events or booking records. Contact SantaBlizard about deletion of those records.'
    ]},
    {title: 'Service providers and authorized access', paragraphs: [
      'Cloudflare supplies website hosting, database, authentication, and abuse-protection services. Google supplies the authorized bookings calendar. Resend handles transactional email when delivery is enabled. These providers process information needed for their functions and apply their own privacy and security policies. Information may be processed in locations outside your state or country.',
      'Booking information is available through restricted administrative tools to authorized operators. Operational alerts are directed only to configured, approved recipients. Optional private child notes, if separately enabled in the future, require their own access and consent review. Information may also be disclosed where required by law or necessary to address security or legal obligations.'
    ]},
    {title: 'Security, cookies, and technical information', paragraphs: [
      'Hosting and security providers may process technical information such as IP addresses, browser information, authentication events, and verification results to operate and protect the website. Authentication and bot protection may use essential cookies or verification tokens. Advertising trackers are not part of this booking integration.',
      'Private dashboard access is restricted, connections use HTTPS, and Google authorization tokens are encrypted before database storage. Access controls and encryption reduce risk, but no online service can promise absolute security. Do not share private dashboard credentials or invitation links.'
    ]},
    {title: 'Retention, access, correction, and deletion', paragraphs: [
      'A fixed automatic deletion period for booking records has not been adopted. Records are kept for handling inquiries, agreed visits, follow-up, and applicable operational or legal needs. Automatic deletion of optional child notes is disabled; no proposed retention period should be treated as active.',
      'To request access, correction, or deletion, email santablizard@gmail.com with your booking reference if available. Do not include sensitive child information. SantaBlizard will review the request, verify authority where needed, and explain any information that must be retained. Deleting an application record may require separate handling of Calendar entries, email-provider records, or backup copies; those copies are not guaranteed to disappear immediately.'
    ]},
    {title: 'Children and optional Secret Elf Notes', paragraphs: [
      'Inquiries and bookings are intended to be submitted by adults. Secret Elf Notes collection is currently disabled. Please do not submit children’s personal details through booking fields or email.',
      'If optional notes are introduced, a parent or legal guardian must be given a separate notice and consent choice, private access, and editing and deletion controls before collection begins. Skipping optional notes will never affect a visit. A separate privacy and retention review is required before that feature is enabled. Contact SantaBlizard if child information was provided unintentionally.'
    ]},
    {title: 'Changes and contact', paragraphs: [
      'Updates to this policy will be posted with a revised date. Material changes involving a new use of Google data or optional child information will require the appropriate additional notice or consent. For questions or privacy requests, contact santablizard@gmail.com or 845-234-2858.'
    ]}
  ]
};
export const terms: LegalDocument = {
  title: 'Terms of Service',
  description: 'Website use, booking confirmation, scheduling, and contact terms for SantaBlizard.',
  sections: [
    {title: 'Website and booking tools', paragraphs: [
      'These terms describe use of santablizard.com and SantaBlizard’s booking and scheduling tools. SantaBlizard provides Christmas experiences in the Hudson Valley, New York. Use these tools for legitimate adult inquiries and agreed event arrangements. Contact santablizard@gmail.com or 845-234-2858 if anything is unclear.',
      'Some features may be unavailable or disabled. Publishing these terms does not enable online booking, automatic notifications, payment processing, or optional child-note collection.'
    ]},
    {title: 'Requests, quotes, and confirmation', paragraphs: [
      'An inquiry, request receipt, Pending status, or proposed date does not reserve a date or confirm a visit. A booking is confirmed only after the exact service, appointment, duration, and quote have been agreed and Santa has confirmed the booking.',
      'Website prices are base prices. Travel, staffing, equipment logistics, and unusual venue requirements may affect the final quote, as explained on the Services page. Any different total and arrangements must be agreed directly with Santa. Requested times and scheduling information use America/New_York time unless explicitly agreed otherwise.',
      'An agreed reschedule must be applied and confirmed before it replaces the original confirmed arrangement. Contact Santa directly for changes, cancellations, payment arrangements, or any applicable refund terms. These website terms do not introduce a deposit, cancellation fee, or refund schedule; any such arrangement must be separately communicated and agreed.'
    ]},
    {title: 'Accurate adult information and optional preferences', paragraphs: [
      'Provide accurate organizer, event, location, and scheduling information, and make sure you are authorized to arrange the event. A responsible adult should handle booking communications.',
      'Sensory-friendly preferences are optional and do not add a charge to the standard service price. No diagnosis or private child information is needed. Secret Elf Notes collection is disabled; if separately introduced, sharing will remain voluntary and skipping will never affect the visit.'
    ]},
    {title: 'Calendar and email', paragraphs: [
      'Calendar connections and booking emails are used for scheduling and service communications when authorized and enabled. The calendar owner controls whether to connect Google Calendar and may revoke authorization. The Privacy Policy explains that connection.',
      'Delivery can be delayed or affected by account settings, spam filters, device notifications, or provider availability. Contact Santa directly to resolve uncertain arrangements. Missing a reminder or acknowledgment does not automatically cancel or reschedule a booking.'
    ]},
    {title: 'Appropriate use and website materials', paragraphs: [
      'Do not attempt unauthorized access, submit information about other people without authority, interfere with the service, or use it to send abusive or unlawful content. Keep private dashboard credentials and invitation links secure.',
      'Website text, photographs, and artwork may belong to SantaBlizard or their respective owners. Do not reuse material without the appropriate permission. Links to third-party services are subject to those services’ terms and privacy policies.'
    ]},
    {title: 'Updates and questions', paragraphs: [
      'Revised website terms will be posted with an updated date. Changes to an existing agreed booking require direct communication and agreement; a website update does not silently change that booking. For service or privacy questions, contact santablizard@gmail.com or 845-234-2858.'
    ]}
  ]
};
