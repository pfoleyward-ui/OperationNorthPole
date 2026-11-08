/** Added to the authenticated HQ script; no tokens or recipient contact values. */
export const integrationJS=String.raw`
const deliveryLabels={calendar:'Google Calendar',new_request:'New request',confirmation:'Confirmation',seven_days:'7-day reminder',twenty_four_hours:'A Gentle Jingle · 24-hour check',three_hours:'3-hour reminder',morning:'Morning-of reminder',escalation_2:'The Elves Are Concerned',escalation_3:'Mrs. Claus Has Been Notified',escalation_4:'Santa Is Officially in the Doghouse',resolution:'Resolution notice'};
const recipientLabels={google:'Bookings calendar',santa:'Santa',mrs_claus:'Mrs. Claus',technical_admin:'Technical backup'};
async function deliverySection(id){
  const section=node('section',undefined,'notice');section.id='reminders';
  section.append(node('h3','Calendar & delivery status'),node('p','Opening the delivery ledger…'));desk.append(section);
  try{
    const result=await api('bookings/'+id+'/delivery');if(!section.isConnected)return;
    section.replaceChildren(node('h3','Calendar & delivery status'));
    if(current&&current.state.id===id)section.append(node('p','This appointment: '+timingText(current)));
    section.append(node('p','Calendar sync '+(result.calendarSyncEnabled?'enabled':'off')+' · Notifications '+(result.notificationDeliveryEnabled?'enabled':'off')));
    if(!result.plannerEnabled)section.append(node('p','Automatic scheduling is off. No real messages are being sent.'));
    const cycle=result.cycle;
    if(cycle){
      if(cycle.acknowledgedAt)section.append(node('p','Got It! recorded '+format(cycle.acknowledgedAt),'sensory'));
      else if(cycle.ackDue){
        section.append(node('p','Santa’s acknowledgment opens '+format(cycle.ackDue)+'. Missed acknowledgment never cancels a booking.'));
        if(cycle.canAcknowledge)section.append(button('Got It!',async()=>{await api('bookings/'+id+'/reminders/ack',{cycleId:cycle.id});await openBooking(id);say('Got It! recorded. Further escalation is stopped; resolution notices are queued for previously alerted recipients.');}));
        else if(session.role!=='santa')section.append(node('p','Only Santa can record this acknowledgment.'));
      }else section.append(node('p','A 24-hour check is not applicable to this late-confirmed appointment.'));
    }
    if(!result.jobs.length)section.append(node('p','No delivery records have been scheduled yet.'));
    const history=node('details');history.append(node('summary','Show delivery history ('+result.jobs.length+' records)'));
    for(const job of result.jobs){
      const row=node('article',undefined,'card');
      const label=job.kind==='seven_days'?(result.policy.sevenDayHours%24===0?result.policy.sevenDayHours/24+'-day reminder':result.policy.sevenDayHours+'-hour reminder'):job.kind==='twenty_four_hours'?'A Gentle Jingle · '+result.policy.acknowledgmentHours+'-hour check':job.kind==='three_hours'?result.policy.finalReminderHours+'-hour reminder':deliveryLabels[job.kind]||'Delivery';
      row.append(node('h4',label),node('span',job.state,'badge'),node('p',(recipientLabels[job.recipient]||'Recipient')+(job.channel?' · '+job.channel:'')),node('p','Scheduled: '+format(job.due_at)),node('p','Provider attempts: '+job.attempts,'muted'));
      if(job.accepted_at)row.append(node('p','Accepted by provider: '+format(job.accepted_at),'muted'));
      if(job.error_code)row.append(node('p','Status: '+job.error_code.replaceAll('_',' '),'muted'));
      if(session.role==='santa'&&(['uncertain','unknown','retry','blocked','failed'].includes(job.state)||(job.kind==='calendar'&&job.state==='delivered'))){
        row.append(button('Check '+(deliveryLabels[job.kind]||'delivery')+' again',async()=>{await api('bookings/'+id+'/delivery/retry',{jobId:job.id});await openBooking(id);say('Queued for a safe provider status check. Delivery gates still apply.');}));
      }
      history.append(row);
    }
    if(result.jobs.length)section.append(history);
    section.append(button('Calendar & delivery settings',()=>show('delivery')));
    if(location.hash==='#reminders')section.scrollIntoView({block:'start'});
  }catch(error){if(section.isConnected)section.replaceChildren(node('h3','Calendar & delivery status'),node('p',error.message));}
}
async function deliverySettings(){
  const generation=renderEpoch;
  const result=await api('integrations/status');if(generation!==renderEpoch)return;
  desk.append(node('h2','Calendar & delivery settings'));
  const dl=node('dl',undefined,'facts');
  fact(dl,'Scheduling',result.plannerEnabled?'Enabled':'Off');
  fact(dl,'Notifications',result.notificationDeliveryEnabled?'Enabled':'Off');
  fact(dl,'Google connection',result.google.connected?'Connected':result.google.connectionStatus.replaceAll('_',' '));
  fact(dl,'Bookings calendar',result.google.calendarState.replaceAll('_',' '));
  fact(dl,'Calendar sync',result.google.syncEnabled?'Enabled':'Off');
  fact(dl,'Timezone',result.policy.timeZone);fact(dl,'Morning reminder',result.policy.morningTime);
  fact(dl,'Acknowledgment reminder',result.policy.acknowledgmentHours+' hours before the appointment');
  fact(dl,'Quiet hours',result.policy.quietStart+'–'+result.policy.quietEnd+' · nonurgent messages wait');
  fact(dl,'Escalation timing',result.policy.escalationMinutes.map((m,i)=>'Level '+(i+1)+': '+m+' minutes').join(' · '));
  desk.append(dl,node('p','Only confirmed appointments go to the SantaBlizard Bookings calendar. Private family notes and child information never belong in messages or calendar entries.'));
  if(result.runnerError)desk.append(node('p','Scheduler needs attention: '+String(result.runnerError.code).replaceAll('_',' ')));
  if(session.role==='santa'){
    const connect=button('Connect Google securely',async()=>{
      const response=await api('integrations/google/start',{});const url=new URL(response.authorizationUrl);
      if(url.origin!=='https://accounts.google.com')throw new Error('Unexpected authorization destination.');
      location.assign(url.href);
    });connect.disabled=!result.google.oauthEnabled;desk.append(connect);
    if(!result.google.oauthEnabled)desk.append(node('p','Google authorization is off until approved server configuration and staging tests are ready.','muted'));
    if(result.google.connected&&result.google.calendarState==='missing'){const create=button('Create SantaBlizard Bookings calendar',async()=>{await api('integrations/google/calendar',{});await show('delivery');});create.disabled=!result.google.oauthEnabled;desk.append(create);}
    if(result.google.connected&&['creating','uncertain'].includes(result.google.calendarState)){
      let calendarId;const recovery=form('Recover an uncertain calendar setup','Verify existing calendar',async()=>{await api('integrations/google/calendar',{calendarId:calendarId.value});await show('delivery');});
      recovery.body.append(node('p','An earlier setup may have succeeded. Copy its calendar ID from Google settings; do not create another calendar.'));
      calendarId=field(recovery.body,'Existing SantaBlizard Bookings calendar ID');calendarId.maxLength=500;desk.append(recovery.f);
    }
    if(result.google.connected||result.google.connectionStatus==='revocation_pending'){const disconnect=button('Disconnect Google',async()=>{if(!confirm('Revoke this app’s Google access? Existing calendar events will remain.'))return;await api('integrations/google/disconnect',{});await show('delivery');},'danger');disconnect.disabled=!result.google.oauthEnabled;desk.append(disconnect);}
  }else desk.append(node('p','Santa manages the Google connection. Backup access does not grant OAuth or acknowledgment authority.'));
  desk.append(node('p','Mrs. Claus SMS requires prior recorded consent. The reminder system never changes or cancels a booking. Secret Elf Notes collection remains off.'));
}
document.getElementById('delivery-settings').addEventListener('click',()=>{if(session)show('delivery').catch(e=>say(e.message));});
`;
