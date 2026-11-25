import {canonical} from './shared.ts';
import type {Snapshot} from './integration-plan.ts';
/** Only changes a customer needs to hear about; staffing and note preparation do not send mail. */
export function customerEmailState(s:Snapshot):string|null {
  const state=s.state;
  if(!['confirmed','canceled','declined','awaiting_customer_acceptance'].includes(state.status)&&!(state.status==='confirmed'&&state.change?.shared))return null;
  const q=state.status==='confirmed'&&state.change?.shared?state.change.quote:state.quote;
  return canonical({status:state.status,proposal:Boolean(state.status==='confirmed'&&state.change?.shared)||state.status==='awaiting_customer_acceptance',...(q?{start:q.start,end:q.end,quoteId:q.id,quoteRevision:q.revision}:{} )});
}
export function customerEmailText(s:Snapshot):string {
  const proposal=(s.state.status==='confirmed'&&s.state.change?.shared)||s.state.status==='awaiting_customer_acceptance';
  const intro=proposal?'Santa has a scheduling proposal for your review. A proposal is not a new confirmation.':s.state.status==='confirmed'?'Santa has confirmed your booking.':s.state.status==='canceled'?'Your booking has been canceled.':'Santa is unable to accept this request.';
  const q=s.state.status==='confirmed'&&s.state.change?.shared?s.state.change.quote:s.state.quote;
  const time=q&&(proposal||s.state.status==='confirmed')?'\n'+(proposal?'Proposed time: ':'Appointment: ')+new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'short'}).format(q.start)+' (America/New_York).':'';
  return intro+time+'\nReference: '+s.id+'. Reply to this email for scheduling questions. Please do not include private child information.';
}
