/** Authenticated Worker assets. Customer values enter the DOM only via textContent. */
export const hqHTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>Santa HQ | SantaBlizard</title><link rel="stylesheet" href="/hq/style.css"><script src="/hq/app.js" defer></script></head><body><a class="skip" href="#desk">Skip to Santa's desk</a><header><p class="eyebrow">Operation North Pole · Hudson Valley</p><h1>Santa’s Correspondence Desk</h1><p>A little care behind every Christmas memory.</p><div class="session"><span id="identity">Checking secure access…</span><a href="/cdn-cgi/access/logout">Sign out</a></div></header><nav aria-label="Santa HQ"><button data-view="new" type="button">New Requests</button><button data-view="today" type="button">Today’s Events</button><button data-view="calendar" type="button">Calendar</button><button data-view="add" type="button">Add Booking</button></nav><p class="guard">Private Santa HQ · Public intake, outgoing notifications, and Secret Elf Notes collection are off.</p><div id="message" role="status" aria-live="polite"></div><main id="desk" tabindex="-1"><p>Opening the correspondence desk…</p></main><footer>Santa handles the daily Christmas magic. Technical backup is for escalation only.</footer></body></html>`;

export const hqCSS = `:root{color-scheme:light;--evergreen:#173c31;--burgundy:#73262b;--gold:#b08a42;--ink:#35261d;--paper:#f5ead2}*{box-sizing:border-box}body{margin:0;background:#152e28;color:var(--ink);font:18px/1.55 Georgia,'Times New Roman',serif;background-image:repeating-linear-gradient(110deg,#ffffff03 0 2px,transparent 2px 8px)}header{color:var(--paper);text-align:center;padding:24px 20px 18px;border-bottom:3px double var(--gold);background:linear-gradient(140deg,#203e32,#381d20)}h1{font-size:clamp(1.8rem,5vw,3rem);line-height:1.14;margin:8px auto;max-width:900px;text-shadow:0 2px 1px #000}h2{color:var(--burgundy);line-height:1.2;font-size:1.8rem}h3{line-height:1.3;color:var(--evergreen)}p{margin:10px 0}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.75rem;color:#e0c997}.session{display:flex;gap:20px;justify-content:center;flex-wrap:wrap;font-size:.9rem}.session a{color:#f5ddb0}nav{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:1100px;margin:18px auto;padding:0 16px}button,.shortcut{min-height:48px;touch-action:manipulation;border:1px solid #a1844e;box-shadow:inset 0 0 0 2px #ffffff20;border-radius:4px;padding:12px 16px;font:700 1rem/1.3 Georgia,serif;cursor:pointer;background:var(--evergreen);color:#fff8e5;overflow-wrap:anywhere}button:hover,.shortcut:hover{filter:brightness(1.13)}button:disabled{cursor:wait;opacity:.6}button[aria-current="page"]{background:#f2e2bb;color:var(--burgundy);outline:2px solid var(--gold);outline-offset:2px}a{color:var(--burgundy);text-underline-offset:3px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #c05920;outline-offset:3px}.guard,footer{color:#ead8ac;text-align:center;max-width:950px;margin:16px auto;padding:0 20px;font-size:.9rem}main{max-width:1050px;margin:20px auto 40px;padding:28px;background:var(--paper);background-image:repeating-linear-gradient(45deg,#8b683107 0 1px,transparent 1px 5px);border:5px double #ab854b;box-shadow:0 8px 25px #0006;min-height:280px;border-radius:3px}.card,form,.notice{border:1px solid #c4a87b;background:#fffaf066;padding:18px;margin:16px 0;border-radius:3px}.card h3{margin-top:0}.card button{width:100%;margin-top:12px}.badge{display:inline-block;font-size:.85rem;text-transform:capitalize;border:1px solid #ac8c56;border-radius:20px;padding:3px 12px;background:#e6d7b4;color:#4d3021}.sensory{color:#215343;font-weight:bold}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.field{display:flex;flex-direction:column;gap:6px;min-width:0;margin:10px 0}label{font-size:1rem;font-weight:bold}input,select,textarea{width:100%;min-height:48px;border:1px solid #92794f;border-radius:3px;padding:10px;background:#fffcf4;color:#30251d;font:16px/1.4 system-ui,sans-serif}input[type=checkbox]{width:24px;min-height:24px;accent-color:var(--evergreen)}.check{display:flex;align-items:flex-start;gap:12px;margin:18px 0}.check label{font-weight:normal}.actions,.shortcuts{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}.actions button{flex:1 1 180px}.danger{background:var(--burgundy)}.shortcut{display:flex;align-items:center;text-decoration:none;flex:1 1 150px;justify-content:center}.muted{font-size:.9rem;color:#625143}.facts{display:grid;grid-template-columns:160px minmax(0,1fr);gap:8px 16px;margin:20px 0}.facts dt{font-weight:bold}.facts dd{margin:0;overflow-wrap:anywhere}#message:empty{display:none}#message{max-width:1050px;padding:16px 20px;margin:10px auto;background:#fff0c9;border:2px solid var(--gold);color:#5a2426;overflow-wrap:anywhere}.skip{position:absolute;left:8px;top:-90px;background:#fff;padding:10px;z-index:10}.skip:focus{top:8px}footer{padding-bottom:max(24px,env(safe-area-inset-bottom))}@media(max-width:600px){body{font-size:17px}header{padding:20px 16px}nav{grid-template-columns:repeat(2,1fr);gap:10px}main{margin:12px 10px 24px;padding:18px 14px}.grid{grid-template-columns:1fr;gap:0}.facts{grid-template-columns:1fr;gap:2px}.facts dd{margin-bottom:12px}.actions,.shortcuts{flex-direction:column}.actions button,.shortcut{flex:auto;width:100%}form,.card{padding:14px}h2{font-size:1.6rem}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;

export const hqJS = String.raw`'use strict';
const desk = document.getElementById('desk'), message = document.getElementById('message');
let session, view = 'new', current, selectedDate, sequence = 0, renderEpoch = 0;
const statusNames = { pending: 'Pending — received, not confirmed', under_review: 'Under review', alternative_proposed: 'Alternative proposed', awaiting_customer_acceptance: 'Awaiting customer acceptance', confirmed: 'Confirmed', declined: 'Declined', canceled: 'Canceled', completed: 'Completed' };
function node(tag, text, cls) { const n = document.createElement(tag); if (text !== undefined)
    n.textContent = text; if (cls)
    n.className = cls; return n; }
function say(text) { message.textContent = text; }
function format(ms) { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }).format(ms) + ' · New York'; }
function dateAt(ms) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms); const p = Object.fromEntries(parts.map(x => [x.type, x.value])); return p.year + '-' + p.month + '-' + p.day; }
async function api(path, body, key) { const options = { credentials: 'same-origin', cache: 'no-store', redirect: 'error' }; if (body !== undefined) {
    options.method = 'POST';
    options.headers = { 'Content-Type': 'application/json', 'Idempotency-Key': key || crypto.randomUUID() };
    options.body = JSON.stringify(body);
} const r = await fetch('/hq/api/' + path, options); let result; try {
    result = await r.json();
}
catch {
    throw new Error('Secure access needs refreshing. Reload the desk to sign in again.');
} if (r.status === 401) {
    current = null;
    renderEpoch++;
    desk.replaceChildren(node('h2', 'Secure sign-in required'), node('p', 'Your session has ended. Reload this page to sign in again.'));
    throw new Error('Secure sign-in required.');
} if (!r.ok) {
    const messages = { stale_booking: 'This booking changed on another screen. Reload the latest details before trying again.', resource_unavailable: 'That time conflicts with an existing booking or unavailable resource. The original booking is unchanged.', staffing_required: 'Verify an attendant for this exact quote and time before confirming.', invalid_quote: 'Check the price, duration, holiday dates, and explicitly chosen quote expiry.', explicit_buffers_required: 'Enter the agreed time buffers, including zero if none.', invalid_duration: 'Choose the approved duration or Meet & Greet half-hour increments.', invalid_booking: 'Check the adult contact, event details, and future New York date/time.', customer_agreement_required: 'Record the customer’s agreement to these exact terms first.', current_quote_required: 'Save a current quote with a future appointment and expiry.', dst_choice_required: 'This time occurs twice. Choose the earlier or later New York time.', invalid_or_nonexistent_time: 'That New York date/time does not exist. Choose another time.', existing_booking_conflict: 'That resource is already reserved. Review the booking before blocking this time.' };
    throw new Error(messages[result.error] || 'Unable to save: ' + String(result.error || 'service unavailable').replaceAll('_', ' ') + '. Nothing is automatically confirmed.');
} return result; }
function button(text, fn, cls) { const b = node('button', text, cls); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; try {
    await fn();
}
catch (e) {
    say(e.message);
}
finally {
    b.disabled = false;
} }); return b; }
function field(parent, label, type = 'text', value = '', required = true) { const wrap = node('div', undefined, 'field'), id = 'field-' + (++sequence), l = node('label', label); l.htmlFor = id; let input; if (type === 'select') {
    input = node('select');
}
else {
    input = node('input');
    input.type = type;
} input.id = id; input.required = required; input.value = value; input.autocomplete = 'off'; wrap.append(l, input); parent.append(wrap); return input; }
function select(parent, label, options, value = '') { const s = field(parent, label, 'select'); s.required = !options.some(([v]) => v === ''); for (const [v, t] of options) {
    const o = node('option', t);
    o.value = v;
    s.append(o);
} s.value = value; return s; }
function check(parent, label) { const wrap = node('div', undefined, 'check'), id = 'field-' + (++sequence), c = node('input'), l = node('label', label); c.type = 'checkbox'; c.id = id; c.required = true; l.htmlFor = id; wrap.append(c, l); parent.append(wrap); return c; }
function form(title, submitLabel, handler) { const f = node('form'); f.append(node('h3', title)); const body = node('div'); f.append(body); const save = node('button', submitLabel); save.type = 'submit'; f.append(save); let busy = false; f.addEventListener('submit', async (e) => { e.preventDefault(); if (busy || !f.reportValidity())
    return; busy = true; save.disabled = true; try {
    await handler();
}
catch (error) {
    say(error.message);
}
finally {
    busy = false;
    save.disabled = false;
} }); return { f, body }; }
function fact(dl, name, value) { dl.append(node('dt', name), node('dd', value)); }
function timingText(d) { return d.state.quote ? format(d.state.quote.start) + ' — ' + format(d.state.quote.end) : d.request.timing.date + ' at ' + d.request.timing.time + ' · requested New York time'; }
function card(d) { const c = node('article', undefined, 'card'); c.append(node('span', statusNames[d.state.status], 'badge'), node('h3', d.request.customer.name), node('p', session.services[d.state.serviceId].name), node('p', timingText(d)), node('p', d.request.location)); if (d.request.sensoryFriendly)
    c.append(node('p', 'Sensory-friendly visit requested', 'sensory')); c.append(button('Open booking for ' + d.request.customer.name, () => openBooking(d.state.id))); return c; }
async function showList(nextCursor, container) { const query = new URLSearchParams({ view, date: selectedDate }); if (nextCursor)
    query.set('cursor', nextCursor); const result = await api('bookings?' + query); for (const d of result.bookings)
    container.append(card(d)); if (!result.bookings.length && !nextCursor)
    container.append(node('p', view === 'new' ? 'No new requests are waiting.' : 'No events or requests for this view.')); if (result.nextCursor) {
    const more = button('Load more bookings', async () => { await showList(result.nextCursor, container); more.remove(); });
    container.append(more);
} }
async function show(next) { const generation = ++renderEpoch; view = next; current = null; say(''); for (const b of document.querySelectorAll('nav button'))
    b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'); desk.replaceChildren(); if (view === 'add') {
    manualForm();
    return;
} desk.append(node('h2', view === 'new' ? 'New Requests' : view === 'today' ? 'Today’s Events' : 'Santa’s Calendar')); if (view === 'new')
    desk.append(node('p', 'Open letters stay here through review and customer agreement. Pending requests never reserve a date.')); if (view === 'today')
    desk.append(node('p', 'Confirmed events for today in America/New_York.')); if (view === 'calendar') {
    const date = field(desk, 'Calendar date', 'date', selectedDate);
    date.addEventListener('change', async () => { selectedDate = date.value; try {
        await show('calendar');
    }
    catch (e) {
        say(e.message);
    } });
    desk.append(node('p', 'Requested times do not reserve Santa. Confirmed bookings and resource blocks are checked together.'));
} const list = node('section'); list.setAttribute('aria-label', 'Booking list'); desk.append(list); await showList(null, list); if (generation !== renderEpoch) return; if (view === 'calendar')
    await availability(); }
async function openBooking(id) { const generation = ++renderEpoch; const detail = await api('bookings/' + id); if (generation !== renderEpoch) return; current = detail; renderDetail(); desk.focus(); }
async function action(name, extra = {}) { const id = current.state.id; const generation = renderEpoch; await api('bookings/' + id + '/actions', { action: name, expectedVersion: current.state.version, ...extra }); if (generation !== renderEpoch) { say('Saved securely. No outgoing notification was sent.'); return; } await openBooking(id); say('Saved securely. No outgoing notification was sent.'); }
function offlineForm(title, label, name, agreement) { let channel, ack; const f = form(title, label, () => action(name, { channel: channel.value, [agreement ? 'customerAgreed' : 'quoteCommunicated']: ack.checked })); channel = select(f.body, 'How was this discussed?', [['phone', 'Phone'], ['text', 'Text'], ['facebook', 'Facebook'], ['in_person', 'In person']], 'phone'); ack = check(f.body, agreement ? 'I have the customer’s agreement to this exact quote, price, and appointment.' : 'I have shared these exact quote terms with the customer outside this dashboard.'); desk.append(f.f); }
function quoteForm(reschedule) { let date, time, dst, duration, total, expiryDate, expiryTime, expiryDST, reason; const f = form(reschedule ? 'Propose a reschedule — keep the current booking' : 'Prepare a quote or another time', 'Save proposal', () => { const quote = { date: date.value, time: time.value, durationMinutes: Number(duration.value), expiryDate: expiryDate.value, expiryTime: expiryTime.value }; if (dst.value)
    quote.disambiguation = dst.value; if (expiryDST.value)
    quote.expiryDisambiguation = expiryDST.value; if (total.value !== '')
    quote.totalCents = Math.round(Number(total.value) * 100); if (reason.value.trim())
    quote.adjustmentReason = reason.value.trim(); return action(reschedule ? 'propose_reschedule' : 'propose', { quote }); }); const grid = node('div', undefined, 'grid'); f.body.append(grid); date = field(grid, 'Proposed date (New York)', 'date', current.request.timing.date); time = field(grid, 'Proposed time (New York)', 'time', current.request.timing.time); dst = select(grid, 'Repeated-time choice', [['', 'Only needed when time repeats'], ['earlier', 'Earlier occurrence'], ['later', 'Later occurrence']]); const rate = session.services[current.state.serviceId]; duration = field(grid, 'Agreed duration (minutes)', 'number', String(current.request.timing.durationMinutes || rate.durationMinutes || '')); duration.min = '1'; duration.step = '1'; if (rate.durationMinutes !== null)
    duration.readOnly = true; total = field(grid, 'Custom total (USD; blank uses approved duration price)', 'number', '', false); total.min = '.01'; total.step = '.01'; expiryDate = field(grid, 'Quote expiry date — Santa’s choice (New York)', 'date'); expiryTime = field(grid, 'Quote expiry time (New York)', 'time'); expiryDST = select(grid, 'Expiry repeated-time choice', [['', 'Only needed when time repeats'], ['earlier', 'Earlier occurrence'], ['later', 'Later occurrence']]); reason = field(f.body, 'Explain a custom price adjustment (no private child details)', 'text', '', false); reason.maxLength = 2000; f.body.append(node('p', reschedule ? 'The original confirmed time remains reserved until an agreed change is applied.' : 'No notification is sent. This saves a proposal for offline discussion.', 'muted')); desk.append(f.f); }
function confirmationForm(reschedule) { let before, after; const f = form(reschedule ? 'Apply agreed reschedule' : 'Confirm this agreed booking', reschedule ? 'Apply reschedule securely' : 'Confirm booking', () => action(reschedule ? 'apply_reschedule' : 'confirm', { beforeMinutes: Number(before.value), afterMinutes: Number(after.value) })); before = field(f.body, 'Agreed buffer before (minutes; enter 0 if none)', 'number'); after = field(f.body, 'Agreed buffer after (minutes; enter 0 if none)', 'number'); for (const i of [before, after]) {
    i.min = '0';
    i.step = '1';
} f.body.append(node('p', 'Santa, booth, attendant, existing reservations, and unavailable times are checked together when saving.', 'muted')); desk.append(f.f); }
function renderDetail() {
    const d = current, s = d.state;
    desk.replaceChildren(node('h2', 'Booking correspondence'));
    const top = node('div', undefined, 'actions');
    top.append(button('Back to ' + (view === 'today' ? 'Today’s Events' : view === 'calendar' ? 'Calendar' : 'New Requests'), () => show(view === 'add' ? 'new' : view)), button('Reload latest details', () => openBooking(s.id)));
    desk.append(top, node('span', statusNames[s.status], 'badge'), node('h3', d.request.customer.name));
    const dl = node('dl', undefined, 'facts');
    fact(dl, 'Reference', s.id);
    fact(dl, 'Service', session.services[s.serviceId].name);
    fact(dl, 'Appointment', timingText(d));
    fact(dl, 'Requested time', d.request.timing.date + ' at ' + d.request.timing.time + (d.request.timing.latestTime ? ' to ' + d.request.timing.latestTime + ' start window' : '') + ' · America/New_York');
    if (d.request.alternative)
        fact(dl, 'Alternative request', d.request.alternative.date + ' at ' + d.request.alternative.time);
    fact(dl, 'Location', d.request.location);
    fact(dl, 'Event', d.request.eventType);
    fact(dl, 'Guests', d.request.guestCount === undefined ? 'Not supplied' : String(d.request.guestCount));
    fact(dl, 'Adult email', d.request.customer.email);
    fact(dl, 'Adult phone', d.request.customer.phone);
    fact(dl, 'Received by', d.source);
    fact(dl, 'Sensory-friendly', d.request.sensoryFriendly ? 'Requested — patient, child-led, no forced hugs or photos; no added charge' : 'No preference supplied');
    desk.append(dl);
    const links = node('div', undefined, 'shortcuts');
    for (const [label, url] of [['Call customer', 'tel:' + d.request.customer.phone.replace(/[^+\d]/g, '')], ['Email customer', 'mailto:' + encodeURIComponent(d.request.customer.email)], ['Navigate to event', 'https://maps.apple.com/?q=' + encodeURIComponent(d.request.location)]]) {
        const a = node('a', label, 'shortcut');
        a.href = url;
        a.rel = 'noreferrer noopener';
        if (url.startsWith('https:'))
            a.target = '_blank';
        links.append(a);
    }
    desk.append(links);
    if (s.quote) {
        const q = node('section', undefined, 'notice');
        q.append(node('h3', 'Current quote'), node('p', new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(s.quote.totalCents / 100) + ' · ' + ((s.quote.end - s.quote.start) / 60000) + ' minutes'), node('p', 'Expiry: ' + format(s.quote.expiresAt)), node('p', 'Quote revision ' + s.quote.revision + (s.acceptance ? ' · Customer agreement recorded' : ' · No agreement recorded')));
        if (s.quote.adjustmentReason)
            q.append(node('p', s.quote.adjustmentReason));
        desk.append(q);
    }
    const actions = node('div', undefined, 'actions');
    if (s.status === 'pending')
        actions.append(button('Review request', () => action('review')));
    if (['pending', 'under_review', 'alternative_proposed', 'awaiting_customer_acceptance'].includes(s.status))
        actions.append(button('Decline request', () => { if (confirm('Decline this request? No notification will be sent.'))
            return action('decline'); }, 'danger'));
    if (!['declined', 'canceled', 'completed'].includes(s.status))
        actions.append(button('Cancel booking', () => { if (confirm('Cancel this booking and release its resources? No notification will be sent.'))
            return action('cancel'); }, 'danger'));
    if (s.status === 'confirmed')
        actions.append(button('Mark event completed', () => action('complete')));
    desk.append(actions);
    if (['under_review', 'awaiting_customer_acceptance'].includes(s.status))
        quoteForm(false);
    if (s.status === 'alternative_proposed') {
        offlineForm('Record quote shared offline', 'Record quote shared', 'share_quote', false);
        desk.append(button('Return to review / revise quote', () => action('review')));
    }
    if (s.status === 'awaiting_customer_acceptance') {
        if (!s.acceptance)
            offlineForm('Record customer agreement', 'Record exact agreement', 'record_agreement', true);
        else
            confirmationForm(false);
    }
    if (s.status === 'confirmed') {
        if (!s.change)
            quoteForm(true);
        else {
            const change = node('section', undefined, 'notice');
            change.append(node('h3', 'Proposed change — original booking still reserved'), node('p', format(s.change.quote.start) + ' — ' + format(s.change.quote.end)), node('p', new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(s.change.quote.totalCents / 100)), node('p', 'Expiry: ' + format(s.change.quote.expiresAt)));
            desk.append(change);
            if (!s.change.shared)
                offlineForm('Record reschedule shared offline', 'Record change shared', 'share_reschedule', false);
            else if (!s.change.acceptance)
                offlineForm('Record agreement to changed terms', 'Record change agreement', 'record_change_agreement', true);
            else
                confirmationForm(true);
            desk.append(button('Discard change; keep original booking', () => action('discard_reschedule')));
        }
    }
    if (['photo-booth', 'complete-party'].includes(s.serviceId) && ((s.quote && ['alternative_proposed', 'awaiting_customer_acceptance'].includes(s.status)) || (s.status === 'confirmed' && s.change))) {
        let attendant;
        const f = form('Verify staffing for this exact proposed appointment', 'Verify attendant', () => action('verify_staffing', { attendantRef: attendant.value }));
        attendant = field(f.body, 'Attendant business reference (no child information)');
        attendant.maxLength = 100;
        const quote = s.change?.quote || s.quote;
        const assigned = d.staffing.find(a => a.quote_id === quote.id && a.quote_revision === quote.revision);
        if (assigned)
            f.body.append(node('p', 'Verified attendant: ' + assigned.attendant_ref));
        desk.append(f.f);
    }
    if (s.status === 'confirmed' && s.serviceId === 'home-visits') {
        const elf = node('section', undefined, 'notice');
        elf.append(node('h3', 'Secret Elf Notes — preparation only'), node('p', 'Sharing will be entirely voluntary. Skipping will never affect the visit. Collection is off until consent, private access, deletion, and retention controls are reviewed.'), node('p', d.elfInvitationPrepared ? 'Invitation plan prepared. Nothing sent; no notes collected.' : 'You may prepare an invitation plan. No message or family link will be created.'));
        if (!d.elfInvitationPrepared)
            elf.append(button('Prepare optional invitation plan', () => action('prepare_elf_invitation')));
        desk.append(elf);
    }
}
function manualForm() { desk.append(node('h2', 'Add a booking received personally'), node('p', 'For phone, text, or Facebook requests. Save only adult contact and event details. No child names, diagnoses, birthdates, school information, or Secret Elf Notes.')); let source, service, date, time, dst, duration, name, email, phone, location, event, guests, sensory; let key = crypto.randomUUID(); const f = form('A new letter for Santa', 'Save as Pending', async () => { const req = { serviceId: service.value, timing: { date: date.value, time: time.value }, customer: { name: name.value, email: email.value, phone: phone.value }, location: location.value, eventType: event.value, sensoryFriendly: sensory.checked, answers: {} }; if (dst.value)
    req.timing.disambiguation = dst.value; if (duration.value)
    req.durationMinutes = Number(duration.value); if (guests.value !== '')
    req.guestCount = Number(guests.value); const saved = await api('bookings', { request: req, source: source.value }, key); key = crypto.randomUUID(); await openBooking(saved.id); say('Saved as Pending. No date was reserved or notification sent.'); }); const g = node('div', undefined, 'grid'); f.body.append(g); source = select(g, 'Request received by', [['phone', 'Phone'], ['text', 'Text'], ['facebook', 'Facebook']], 'phone'); service = select(g, 'Service', Object.entries(session.services).map(([id, s]) => [id, s.name]), 'home-visits'); date = field(g, 'Preferred date (New York)', 'date'); time = field(g, 'Preferred time (New York)', 'time'); dst = select(g, 'Repeated-time choice', [['', 'Only needed when time repeats'], ['earlier', 'Earlier occurrence'], ['later', 'Later occurrence']]); duration = field(g, 'Agreed duration (minutes)', 'number', '30', false); duration.min = '1'; duration.step = '1'; duration.readOnly = true; service.addEventListener('change', () => { const s = session.services[service.value]; duration.value = s.durationMinutes === null ? '' : String(s.durationMinutes); duration.readOnly = s.durationMinutes !== null; }); name = field(g, 'Adult organizer name'); name.maxLength = 200; email = field(g, 'Adult email', 'email'); email.maxLength = 254; phone = field(g, 'Adult phone', 'tel'); phone.maxLength = 50; location = field(g, 'Event location'); location.maxLength = 2000; event = field(g, 'Event type'); event.maxLength = 200; guests = field(g, 'Approximate guest count', 'number', '', false); guests.min = '0'; guests.step = '1'; sensory = check(f.body, 'Sensory-friendly interaction requested (optional; no reason or medical details)'); sensory.required = false; f.body.append(node('p', 'Pending means received, not accepted or confirmed.', 'muted')); desk.append(f.f); }
async function availability() { const section = node('section', undefined, 'notice'); section.append(node('h3', 'Resource unavailability')); desk.append(section); const blocks = await api('unavailable?date=' + selectedDate); for (const b of blocks) {
    const block = node('div', undefined, 'card');
    block.append(node('p', b.resource + ' · ' + format(b.start) + ' — ' + format(b.end)), button('Release ' + b.resource + ' block', async () => { if (!confirm('Release this unavailable resource block?'))
        return; await api('unavailable', { action: 'release', id: b.id }); await show('calendar'); say('Resource block released.'); }));
    section.append(block);
} if (!blocks.length)
    section.append(node('p', 'No resource blocks for this day.')); let resource, date, time, duration, dst; const id = crypto.randomUUID(); const f = form('Block an unavailable resource', 'Save unavailable time', async () => { const body = { id, resource: resource.value, date: date.value, time: time.value, durationMinutes: Number(duration.value) }; if (dst.value)
    body.disambiguation = dst.value; await api('unavailable', body); await show('calendar'); say('Resource block saved. Existing bookings were checked.'); }); resource = select(f.body, 'Resource', [['santa', 'Santa'], ['photo-booth', 'Photo booth'], ['booth-attendant', 'Booth attendant']], 'santa'); date = field(f.body, 'Unavailable date (New York)', 'date', selectedDate); time = field(f.body, 'Unavailable start (New York)', 'time'); duration = field(f.body, 'Unavailable duration (minutes)', 'number'); duration.min = '1'; duration.step = '1'; dst = select(f.body, 'Repeated-time choice', [['', 'Only needed when time repeats'], ['earlier', 'Earlier occurrence'], ['later', 'Later occurrence']]); section.append(f.f); }
for (const b of document.querySelectorAll('nav button'))
    b.addEventListener('click', () => { if (session)
        show(b.dataset.view).catch(e => say(e.message)); });
api('session').then(s => { session = s; selectedDate = s.today; document.getElementById('identity').textContent = s.role === 'santa' ? 'Securely signed in · Santa' : 'Escalation backup access · actions are audited'; return show('new'); }).catch(e => { desk.replaceChildren(node('h2', 'Secure access unavailable'), node('p', 'Reload to sign in with Santa’s authorized account.')); say(e.message); });
`;
