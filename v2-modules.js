/* FloodBridge V2 institutional modules. No provider secret is stored in this browser. */
(() => {
  'use strict';
  const $v = (id) => document.getElementById(id);
  const V2 = { incidents: [], tasks: [], channels: {}, profile: {}, secrets: null, loadedOrg: null, realtime: null, realtimeOrg: null, incidentMap: null, incidentLayer: null };
  const escV2 = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const channelDefaults = {
    ussd: {provider:'africastalking', shortcode:'', account:''},
    email: {provider:'sendgrid', address:'', domain:''},
    meta: {whatsapp:'', facebook:'', instagram:'', x:'', other:''},
    notify: {smsProvider:'twilio', smsSender:'', notificationEmail:'', metaPhoneId:''}
  };
  function cfg(){
    const c = window.FLOODBRIDGE_CONFIG || {};
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('floodbridge_cloud') || '{}'); } catch (_) {}
    return { url: String(c.supabaseUrl || saved.url || '').replace(/\/$/, ''), key: String(c.supabaseAnonKey || saved.key || ''), publicOrgId: c.publicOrgId || new URLSearchParams(location.search).get('org_id') || '' };
  }
  function hasCloud(){ return !!(typeof cloud !== 'undefined' && cloud.client && cloud.user && cloud.org); }
  async function bearer(){
    if (hasCloud()) { const {data} = await cloud.client.auth.getSession(); return data.session?.access_token || cfg().key; }
    return cfg().key;
  }
  async function invoke(name, body={}, method='POST'){
    const c=cfg(); if(!c.url || !c.key) throw new Error('Supabase project URL and public key are not configured in config.js.');
    const token=await bearer();
    const res=await fetch(`${c.url}/functions/v1/${name}`,{method,headers:{'Content-Type':'application/json','apikey':c.key,'Authorization':`Bearer ${token}`},body:method==='GET'?undefined:JSON.stringify(body)});
    const txt=await res.text(); let data={}; try{data=txt?JSON.parse(txt):{}}catch(_){data={message:txt}}
    if(!res.ok) throw new Error(data.error || data.message || `Function ${name} returned ${res.status}`);
    return data;
  }
  function requireOrg(){ if(!hasCloud()) throw new Error('Connect Supabase, sign in and select your organisation in Settings & team first.'); return cloud.org.id; }
  function requireAdmin(){ requireOrg(); if(cloud.role!=='admin') throw new Error('Only an organisation administrator can change institutional integration settings.'); }
  async function allOrgRows(table, order='created_at', pageSize=1000, maxRows=50000){
    const rows=[];let offset=0;
    while(offset<maxRows){
      let q=cloud.client.from(table).select('*').eq('org_id',cloud.org.id);
      if(order)q=q.order(order,{ascending:false});
      const r=await q.range(offset,Math.min(offset+pageSize-1,maxRows-1));
      if(r.error)throw r.error;
      rows.push(...(r.data||[]));
      if(!r.data||r.data.length<pageSize)break;
      offset+=pageSize;
    }
    if(rows.length>=maxRows)throw new Error(`Export / load limit reached for ${table}. Increase the approved export limit or use a managed database backup.`);
    return rows;
  }
  function notice(target, msg, cls='blue'){ const el=$v(target); if(el) el.innerHTML=`<div class="notice ${cls}">${escV2(msg)}</div>`; }
  function setText(id, value){ const el=$v(id); if(el)el.textContent=value; }
  function setInput(id,value){const el=$v(id);if(el)el.value=value??'';}
  function getInput(id){return ($v(id)?.value||'').trim();}
  function orgEndpoint(fn, tokenName){
    const c=cfg(); const id=cloud?.org?.id || '';
    if(!c.url || !id) return '';
    return `${c.url}/functions/v1/${fn}?org_id=${encodeURIComponent(id)}${tokenName?`&token=YOUR_${tokenName}`:''}`;
  }
  function startV2Realtime(){
    if(!hasCloud()||V2.realtimeOrg===cloud.org.id)return;
    if(V2.realtime)cloud.client.removeChannel(V2.realtime);
    const id=cloud.org.id;let ch=cloud.client.channel('floodbridge-v2-'+id);
    for(const table of ['fb_incidents','fb_response_tasks','fb_messages']) ch=ch.on('postgres_changes',{event:'*',schema:'public',table,filter:'org_id=eq.'+id},()=>{
      if(table==='fb_incidents')loadIncidents();
      if(table==='fb_response_tasks')loadTasks();
      if(table==='fb_messages'&&document.getElementById('page-notifications')&&!document.getElementById('page-notifications').classList.contains('hidden'))loadMessages();
    });
    ch.subscribe();V2.realtime=ch;V2.realtimeOrg=id;
  }
  async function loadSettings(){
    if(!hasCloud()){setText('v2ProfileStatus','Connect cloud and sign in');return;}
    const id=cloud.org.id;
    if(V2.loadedOrg===id && V2.settingsLoaded) return;
    try{
      const [p,ch]=await Promise.all([
        cloud.client.from('fb_org_profiles').select('data').eq('org_id',id).maybeSingle(),
        cloud.client.from('fb_channels').select('*').eq('org_id',id)
      ]);
      if(p.error) throw p.error; if(ch.error) throw ch.error;
      V2.profile=p.data?.data||{}; V2.channels={}; (ch.data||[]).forEach(x=>V2.channels[x.channel_key]={provider:x.provider,config:x.config||{},enabled:x.enabled,status:x.status||'pending'});
      const f=V2.profile;
      setInput('v2OrgDisplayName',f.display_name||cloud.org.name);setInput('v2OrgRegion',f.region);setInput('v2OrgWebsite',f.website);setInput('v2OrgEmail',f.public_email);setInput('v2OrgPhone',f.emergency_phone);setInput('v2OrgLanguages',f.languages);setInput('v2OrgCoverage',f.coverage);
      const us=V2.channels.ussd?.config||{};setInput('v2UssdCode',us.shortcode);setInput('v2UssdAccount',us.account);setInput('v2UssdProvider',V2.channels.ussd?.provider||'africastalking');
      const em=V2.channels.email?.config||{};setInput('v2EmailAddress',em.address);setInput('v2EmailDomain',em.domain);setInput('v2EmailProvider',V2.channels.email?.provider||'sendgrid');
      const me=V2.channels.meta?.config||{};setInput('v2WhatsAppNumber',me.whatsapp);setInput('v2FacebookUrl',me.facebook);setInput('v2InstagramUrl',me.instagram);setInput('v2XUrl',me.x);setInput('v2OtherSocial',me.other);
      const sb=V2.channels.social_bridge?.config||{};setInput('v2SocialBridgeProvider',sb.provider||'');
      const no=V2.channels.notify?.config||{};setInput('v2SmsProvider',no.smsProvider||'twilio');setInput('v2SmsSender',no.smsSender);setInput('v2NotifyEmail',no.notificationEmail);setInput('v2MetaPhoneId',no.metaPhoneId);
      setInput('v2UssdEndpoint',orgEndpoint('ussd-gateway','USSD_WEBHOOK_SECRET'));
      setInput('v2EmailEndpoint',orgEndpoint('email-inbound','SENDGRID_INBOUND_SECRET'));
      setInput('v2MetaEndpoint',orgEndpoint('social-webhook'));
      setInput('v2SocialBridgeEndpoint',orgEndpoint('social-webhook'));
      setInput('v2TwilioEndpoint',orgEndpoint('twilio-inbound'));
      const publicUrl=new URL('community.html',location.href);publicUrl.searchParams.set('org_id',id);setInput('v2CommunityUrl',publicUrl.href);
      setText('v2ProfileStatus','Loaded · '+cloud.org.name);
      statusFromSaved(); V2.loadedOrg=id;V2.settingsLoaded=true;
    }catch(e){notice('v2Readiness',e.message,'');setText('v2ProfileStatus','Could not load');}
  }
  function statusFromSaved(){
    const saved=(k)=>V2.channels[k]?.enabled?'Details saved · provider connection must be tested':'Not connected';
    setText('v2UssdStatus',saved('ussd'));setText('v2EmailStatus',saved('email'));setText('v2MetaStatus',saved('meta'));setText('v2SocialBridgeStatus',saved('social_bridge'));setText('v2SmsStatus',saved('notify'));
    setText('v2CloudStatus',hasCloud()?'Connected · '+cloud.org.name:'Not connected');
  }
  async function saveProfile(){
    try{requireAdmin();const data={...V2.profile,display_name:getInput('v2OrgDisplayName'),region:getInput('v2OrgRegion'),website:getInput('v2OrgWebsite'),public_email:getInput('v2OrgEmail'),emergency_phone:getInput('v2OrgPhone'),languages:getInput('v2OrgLanguages'),coverage:getInput('v2OrgCoverage'),updated_at:new Date().toISOString()};
      const r=await cloud.client.from('fb_org_profiles').upsert({org_id:cloud.org.id,data,updated_at:new Date().toISOString()},{onConflict:'org_id'});if(r.error)throw r.error;V2.profile=data;toast('Institution profile saved.');
    }catch(e){toast(e.message,'error');}
  }
  async function saveChannel(key,provider,config){
    try{requireAdmin();const row={org_id:cloud.org.id,channel_key:key,provider,config,enabled:true,status:'pending',last_error:null,updated_at:new Date().toISOString()};const r=await cloud.client.from('fb_channels').upsert(row,{onConflict:'org_id,channel_key'});if(r.error)throw r.error;V2.channels[key]={provider,config,enabled:true,status:'pending'};statusFromSaved();toast('Channel details saved. Provider credentials and webhook registration are still required.');
    }catch(e){toast(e.message,'error');}
  }
  async function disableChannel(key){try{requireAdmin();const old=V2.channels[key];if(!old)throw new Error('Save the channel details before disabling it.');const r=await cloud.client.from('fb_channels').update({enabled:false,status:'disabled',updated_at:new Date().toISOString()}).eq('org_id',cloud.org.id).eq('channel_key',key);if(r.error)throw r.error;V2.channels[key]={...old,enabled:false,status:'disabled'};statusFromSaved();toast('FloodBridge is now blocking this channel. Also disable its callback at the provider to stop unnecessary requests.');}catch(e){toast(e.message,'error');}}
  async function loadIncidents(){
    try{requireOrg();V2.incidents=await allOrgRows('fb_incidents');renderIncidents();fillTaskIncidents();}
    catch(e){notice('v2IncidentTable',e.message,'');}
  }
  function renderIncidents(){
    const q=getInput('v2IncidentSearch').toLowerCase(),status=getInput('v2IncidentStatus'),channel=getInput('v2IncidentChannel');
    const now=new Date();const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const list=V2.incidents.filter(x=>(!status||x.status===status)&&(!channel||x.channel===channel)&&(!q||[x.incident_ref,x.location_text,x.description,x.category].join(' ').toLowerCase().includes(q)));
    const open=V2.incidents.filter(x=>!['resolved','closed','rejected'].includes(x.status));
    setText('v2OpenIncidents',open.length);setText('v2UnverifiedIncidents',V2.incidents.filter(x=>x.verification_status!=='verified').length);setText('v2SevereIncidents',V2.incidents.filter(x=>['high','critical','life-threatening'].includes(String(x.severity).toLowerCase())).length);setText('v2TodayIncidents',V2.incidents.filter(x=>new Date(x.created_at)>=start).length);
    const el=$v('v2IncidentTable');if(!el)return;if(!list.length){el.innerHTML='<div class="empty">No incidents found. Deploy the inbound functions and share the community portal to start receiving reports.</div>';return;}
    el.innerHTML=`<div style="overflow:auto"><table><thead><tr><th>Reference / received</th><th>Incident</th><th>Location / channel</th><th>Severity / verification</th><th>Status</th><th>Actions</th></tr></thead><tbody>${list.map(x=>`<tr><td><b>${escV2(x.incident_ref)}</b><br><span class="sub">${new Date(x.created_at).toLocaleString()}</span></td><td><b>${escV2(x.category||'Other')}</b><br><span class="sub">${escV2((x.description||'').slice(0,170))}</span>${x.source_payload?.duplicate_review?.possible_duplicate?`<br><span class="tag warn">Possible duplicate of ${escV2(x.source_payload.duplicate_review.reference||'another report')}</span>`:''}</td><td>${escV2(x.location_text||'Location not provided')}<br><span class="tag info">${escV2(x.channel)}</span></td><td><span class="tag ${['critical','high','life-threatening'].includes(String(x.severity).toLowerCase())?'bad':'warn'}">${escV2(x.severity||'unknown')}</span><br><span class="tag ${x.verification_status==='verified'?'':'gray'}">${escV2(x.verification_status||'unverified')}</span></td><td><select data-v2-status="${escV2(x.id)}">${['new','acknowledged','in_progress','resolved','closed','rejected'].map(v=>`<option value="${v}" ${v===x.status?'selected':''}>${v.replace('_',' ')}</option>`).join('')}</select></td><td><div class="rowbtns"><button class="btn sm" data-v2-action="verify" data-id="${escV2(x.id)}">Verify</button><button class="btn sm" data-v2-action="triage" data-id="${escV2(x.id)}">AI triage</button><button class="btn sm" data-v2-action="task" data-id="${escV2(x.id)}">Assign task</button></div></td></tr>`).join('')}</tbody></table></div>`;renderIncidentMap();
  }
  function renderIncidentMap(){
    const el=$v('v2IncidentMap'),page=$v('page-incidents');if(!el||!page||page.classList.contains('hidden'))return;
    if(!window.L){el.innerHTML='<div style="padding:18px;color:#b8cad9">Map library unavailable. Incident records remain available in the table.</div>';return;}
    if(!V2.incidentMap){V2.incidentMap=L.map(el).setView([-1.2864,36.8172],6);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(V2.incidentMap);V2.incidentLayer=L.layerGroup().addTo(V2.incidentMap);}
    V2.incidentMap.invalidateSize();V2.incidentLayer.clearLayers();
    const points=V2.incidents.filter(x=>Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))&&x.latitude!==null&&x.longitude!==null);
    for(const x of points){const severe=['high','critical','life-threatening'].includes(String(x.severity).toLowerCase());const marker=L.circleMarker([Number(x.latitude),Number(x.longitude)],{radius:8,color:severe?'#ff6868':'#f2bf5f',weight:2,fillOpacity:.72}).bindPopup(`<b>${escV2(x.incident_ref)}</b><br>${escV2(x.category)} · ${escV2(x.severity)}<br>${escV2(x.location_text||'Location')}<br>${escV2(x.channel)} · ${escV2(x.verification_status)}`);marker.addTo(V2.incidentLayer);}
    if(points.length>1)V2.incidentMap.fitBounds(points.map(x=>[Number(x.latitude),Number(x.longitude)]),{padding:[24,24],maxZoom:13});else if(points.length===1)V2.incidentMap.setView([Number(points[0].latitude),Number(points[0].longitude)],13);else V2.incidentMap.setView([-1.2864,36.8172],6);
  }
  async function updateIncident(id,patch){
    try{if(!hasCloud()||cloud.role==='viewer')throw new Error('Editor or administrator access is required.');const r=await cloud.client.from('fb_incidents').update({...patch,updated_at:new Date().toISOString()}).eq('id',id).eq('org_id',cloud.org.id).select().single();if(r.error)throw r.error;const i=V2.incidents.findIndex(x=>x.id===id);if(i>=0)V2.incidents[i]=r.data;renderIncidents();toast('Incident updated.');}
    catch(e){toast(e.message,'error');}
  }
  async function triageIncident(id){
    try{if(!hasCloud())throw new Error('Sign in to the institutional workspace first.');toast('Requesting AI-assisted triage…');const out=await invoke('incident-triage',{org_id:cloud.org.id,incident_id:id});const i=V2.incidents.findIndex(x=>x.id===id);if(i>=0)V2.incidents[i]={...V2.incidents[i],ai_triage:out.triage};renderIncidents();alert(`AI-assisted triage for ${out.incident_ref||id}\n\nSuggested category: ${out.triage?.category||'—'}\nSuggested severity: ${out.triage?.suggested_severity||'—'}\nConfidence: ${out.triage?.confidence||'—'}\n\n${out.triage?.summary||'No summary'}\n\nThis is advisory only. An authorised officer must review it.`);}
    catch(e){toast(e.message,'error');}
  }
  function fillTaskIncidents(){const el=$v('v2TaskIncident');if(!el)return;const old=el.value;el.innerHTML='<option value="">No linked incident</option>'+V2.incidents.map(x=>`<option value="${escV2(x.id)}">${escV2(x.incident_ref)} · ${escV2(x.location_text||x.category)}</option>`).join('');el.value=old;}
  function fillTaskAssignees(){const el=$v('v2TaskAssignee');if(!el)return;const old=el.value;const members=(typeof cloud!=='undefined'&&Array.isArray(cloud.members)?cloud.members:[]).filter(m=>['admin','editor'].includes(m.role));el.innerHTML='<option value="">Not assigned to a named user</option>'+members.map(m=>`<option value="${escV2(m.user_id)}">${escV2(m.email||m.user_id)} · ${escV2(m.role)}</option>`).join('');el.value=old;}
  async function loadTasks(){
    try{requireOrg();V2.tasks=await allOrgRows('fb_response_tasks');fillTaskAssignees();renderTasks();}
    catch(e){notice('v2TaskTable',e.message,'');}
  }
  function renderTasks(){const el=$v('v2TaskTable');if(!el)return;if(!V2.tasks.length){el.innerHTML='<div class="empty">No response actions have been created.</div>';return;}el.innerHTML=`<div style="overflow:auto"><table><thead><tr><th>Task</th><th>Incident</th><th>Assigned team / user</th><th>Priority</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${V2.tasks.map(x=>{const inc=V2.incidents.find(i=>i.id===x.incident_id);const member=(typeof cloud!=='undefined'&&cloud.members||[]).find(m=>m.user_id===x.assigned_user);return `<tr><td><b>${escV2(x.title)}</b><br><span class="sub">${escV2(x.notes||'')}</span></td><td>${escV2(inc?.incident_ref||'—')}</td><td>${escV2(x.assigned_team||'—')}<br><span class="sub">${escV2(member?.email||(x.assigned_user?'Assigned user':'Unassigned'))}</span></td><td><span class="tag ${x.priority==='urgent'?'bad':x.priority==='high'?'warn':'info'}">${escV2(x.priority)}</span></td><td>${x.due_at?new Date(x.due_at).toLocaleString():'—'}</td><td><select data-v2-task-status="${escV2(x.id)}">${['assigned','accepted','in_progress','blocked','completed','cancelled'].map(v=>`<option ${v===x.status?'selected':''}>${v}</option>`).join('')}</select></td><td><button class="btn sm danger" data-v2-action="task-delete" data-id="${escV2(x.id)}">Delete</button></td></tr>`}).join('')}</tbody></table></div>`;}
  async function createTask(e){e.preventDefault();try{if(!hasCloud()||cloud.role==='viewer')throw new Error('Editor or administrator access is required.');const title=getInput('v2TaskTitle');if(!title)throw new Error('Enter the response action.');const due=getInput('v2TaskDue');const assignee=getInput('v2TaskAssignee');const row={org_id:cloud.org.id,incident_id:getInput('v2TaskIncident')||null,title,assigned_team:getInput('v2TaskTeam'),assigned_user:assignee||null,priority:getInput('v2TaskPriority'),due_at:due?new Date(due).toISOString():null,status:getInput('v2TaskStatus'),notes:getInput('v2TaskNotes'),created_by:cloud.user.id};const r=await cloud.client.from('fb_response_tasks').insert(row).select().single();if(r.error)throw r.error;V2.tasks.unshift(r.data);renderTasks();e.target.reset();toast('Response action created.');}catch(err){toast(err.message,'error');}}
  async function refreshReadiness(){
    const el=$v('v2Readiness');if(!hasCloud()){notice('v2Readiness','Connect and sign in to check backend integration readiness.','');return;}
    try{el.innerHTML='<div class="empty">Checking backend configuration…</div>';const s=await invoke('integration-status',{org_id:cloud.org.id});V2.secrets=s;const items=s.integrations||{};const labels={community:'Public website reporting',ussd:'USSD gateway',email:'Inbound email',meta:'Meta / WhatsApp webhook',sms:'SMS outbound',email_out:'Email outbound',whatsapp_out:'WhatsApp outbound',ai:'AI triage',routing:'Road routing',social_bridge:'Signed social webhook bridge'};el.innerHTML=Object.entries(labels).map(([k,l])=>`<div class="kpirow"><span>${l}</span><b class="${items[k]?.ready?'green':'amber'}">${items[k]?.ready?'Secrets present':'Needs setup'}</b></div>`).join('')+`<p class="hint">This checks whether required server secrets exist. It does not prove the provider account, shortcode, webhook subscription, DNS/MX record or message delivery has been tested.</p>`;
      setText('v2AiStatus',items.ai?.ready?'Secrets present':'Needs setup');setText('v2RoutingStatus',items.routing?.ready?'Secrets present':'Needs setup');
      setText('v2UssdStatus',items.ussd?.ready&&V2.channels.ussd?.enabled?'Secrets present · provider callback still to verify':'Not fully configured');
      setText('v2EmailStatus',items.email?.ready&&V2.channels.email?.enabled?'Secrets present · email DNS/webhook still to verify':'Not fully configured');
      setText('v2MetaStatus',items.meta?.ready&&V2.channels.meta?.enabled?'Secrets present · Meta subscription still to verify':'Not fully configured');
      setText('v2SmsStatus',items.sms?.ready&&V2.channels.notify?.enabled?'Secrets present · test delivery required':'Not fully configured');
      setText('v2SocialBridgeStatus',items.social_bridge?.ready&&V2.channels.social_bridge?.enabled?'Secret present · signed webhook test required':'Not fully configured');
    }catch(e){notice('v2Readiness',e.message,'');}
  }
  async function planRoute(){
    try{const raw=['v2RouteFromLat','v2RouteFromLon','v2RouteToLat','v2RouteToLon'].map(getInput);if(raw.some(x=>x===''))throw new Error('Enter all four coordinates.');const vals=raw.map(Number);if(vals.some(x=>!Number.isFinite(x)))throw new Error('Coordinates must be valid numbers.');if(Math.abs(vals[0])>90||Math.abs(vals[2])>90||Math.abs(vals[1])>180||Math.abs(vals[3])>180)throw new Error('Latitude must be within ±90 and longitude within ±180.');const r=await invoke('route-planner',{org_id:requireOrg(),origin:[vals[1],vals[0]],destination:[vals[3],vals[2]],profile:getInput('v2RouteProfile')||'driving-car'});const route=r.route||{};$v('v2RouteResult').innerHTML=`<b>Route calculated · ${escV2(r.provider||'Routing provider')}</b><div class="kpirow"><span>Distance</span><b>${(Number(route.distance_m||0)/1000).toFixed(2)} km</b></div><div class="kpirow"><span>Estimated provider duration</span><b>${Math.round(Number(route.duration_s||0)/60)} minutes</b></div><p class="sub">${escV2(r.warning||'Check incidents and official road status before travel.')}</p>`;renderRouteHazards();
    }catch(e){notice('v2RouteResult',e.message,'');}
  }
  function renderRouteHazards(){const el=$v('v2RouteHazards');if(!el)return;const rows=V2.incidents.filter(x=>!['resolved','closed','rejected'].includes(x.status)&&Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude)));el.innerHTML=rows.length?`<b>Open geo-tagged incidents to review</b>${rows.slice(0,8).map(x=>`<div class="kpirow"><span>${escV2(x.incident_ref)} · ${escV2(x.location_text||'')}</span><span class="tag warn">${escV2(x.severity||'unknown')}</span></div>`).join('')}`:'<div class="sub">No open geo-tagged incidents currently available in this workspace. Missing coordinates do not imply an area is safe.</div>';}

  async function loadMessages(){
    try{requireOrg();const r=await cloud.client.from('fb_messages').select('*').eq('org_id',cloud.org.id).order('created_at',{ascending:false}).limit(300);if(r.error)throw r.error;const rows=r.data||[];const el=$v('v2MessageLog');if(!rows.length){el.innerHTML='<div class="empty">No communication records yet.</div>';return;}el.innerHTML=`<div style="overflow:auto"><table><thead><tr><th>Time</th><th>Direction / channel</th><th>Sender → recipient</th><th>Content</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString()}</td><td>${escV2(x.direction)}<br><span class="tag info">${escV2(x.channel)}</span></td><td>${escV2(x.sender||'—')} → ${escV2(x.recipient||'—')}</td><td>${escV2(x.subject||'')}<br><span class="sub">${escV2((x.body_preview||'').slice(0,180))}</span></td><td>${escV2(x.delivery_status)}</td></tr>`).join('')}</tbody></table></div>`;}
    catch(e){notice('v2MessageLog',e.message,'');}
  }
  async function sendNotification(e){
    e.preventDefault();try{if(!hasCloud()||cloud.role==='viewer')throw new Error('Editor or administrator access is required.');const channel=getInput('v2NotifyChannel');const to=getInput('v2NotifyTo');const message=getInput('v2NotifyMessage');if(!to||!message)throw new Error('Enter a recipient and message.');const result=await invoke('notify-dispatch',{org_id:cloud.org.id,channel,to,message,subject:getInput('v2NotifySubject')});toast('Provider accepted the notification. Provider ID: '+(result.provider_message_id||'not supplied'));e.target.reset();await loadMessages();}
    catch(err){toast(err.message,'error');}
  }


  async function loadAuditLog(){
    const el=$v('v2AuditLog');if(!el)return;try{requireOrg();if(cloud.role!=='admin')throw new Error('Audit log access is limited to organisation administrators.');const r=await cloud.client.from('fb_audit_log').select('*').eq('org_id',cloud.org.id).order('created_at',{ascending:false}).limit(300);if(r.error)throw r.error;const rows=r.data||[];if(!rows.length){el.innerHTML='<div class="empty">No audit events have been recorded yet.</div>';return;}el.innerHTML=`<div style="overflow:auto"><table><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Record</th><th>Actor</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString()}</td><td>${escV2(x.action)}</td><td>${escV2(x.entity)}</td><td>${escV2(x.record_id||'—')}</td><td>${escV2(x.actor_id||'system / provider')}</td></tr>`).join('')}</tbody></table></div>`;}catch(e){notice('v2AuditLog',e.message,'');}
  }

  async function exportOrgBundle(){
    try{requireOrg();const tables=['fb_sites','fb_observations','fb_assets','fb_telemetry','fb_incidents','fb_response_tasks','fb_messages','fb_channels','fb_org_profiles'];const bundle={app:'FloodBridge',version:'2.0.0',organisation:{id:cloud.org.id,name:cloud.org.name},exported_at:new Date().toISOString(),tables:{}};
      for(const table of tables){bundle.tables[table]=await allOrgRows(table,table==='fb_messages'?'created_at':'updated_at');}
      if(cloud.role==='admin')bundle.tables.fb_audit_log=await allOrgRows('fb_audit_log');
      const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='floodbridge-organisation-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);toast('Organisation backup exported. Store it securely.');
    }catch(e){toast(e.message,'error');}
  }

  function exportTasks(){const cols=['id','incident_id','title','assigned_team','priority','due_at','status','notes','outcome','created_at','updated_at'];const csv=[cols.join(','),...V2.tasks.map(x=>cols.map(k=>'"'+String(x[k]??'').replace(/"/g,'""')+'"').join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='floodbridge-response-tasks.csv';a.click();URL.revokeObjectURL(a.href);}

  function exportIncidents(){const cols=['incident_ref','channel','category','severity','location_text','description','status','verification_status','reporter_contact','created_at'];const csv=[cols.join(','),...V2.incidents.map(x=>cols.map(k=>'"'+String(x[k]??'').replace(/"/g,'""')+'"').join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='floodbridge-incidents.csv';a.click();URL.revokeObjectURL(a.href);}
  function copyFrom(id){const el=$v(id);if(!el)return;navigator.clipboard?.writeText(el.value).then(()=>toast('Copied to clipboard.')).catch(()=>{el.select();document.execCommand('copy');toast('Copied to clipboard.');});}
  async function bind(){
    $v('v2SaveProfile')?.addEventListener('click',saveProfile);
    $v('v2SaveUssd')?.addEventListener('click',()=>saveChannel('ussd',getInput('v2UssdProvider'),{shortcode:getInput('v2UssdCode'),account:getInput('v2UssdAccount')}));
    $v('v2SaveEmail')?.addEventListener('click',()=>saveChannel('email',getInput('v2EmailProvider'),{address:getInput('v2EmailAddress'),domain:getInput('v2EmailDomain')}));
    $v('v2SaveMeta')?.addEventListener('click',()=>saveChannel('meta','meta-cloud-api',{whatsapp:getInput('v2WhatsAppNumber'),facebook:getInput('v2FacebookUrl'),instagram:getInput('v2InstagramUrl'),x:getInput('v2XUrl'),other:getInput('v2OtherSocial')}));
    $v('v2SaveSocialBridge')?.addEventListener('click',()=>saveChannel('social_bridge','signed-webhook-bridge',{provider:getInput('v2SocialBridgeProvider')||'approved social bridge'}));
    $v('v2SaveNotify')?.addEventListener('click',()=>saveChannel('notify',getInput('v2SmsProvider'),{smsProvider:getInput('v2SmsProvider'),smsSender:getInput('v2SmsSender'),notificationEmail:getInput('v2NotifyEmail'),metaPhoneId:getInput('v2MetaPhoneId')}));
    $v('v2CheckIntegrations')?.addEventListener('click',refreshReadiness);document.querySelectorAll('[data-v2-disable]').forEach(b=>b.addEventListener('click',()=>disableChannel(b.dataset.v2Disable))); 
    $v('v2RefreshIncidents')?.addEventListener('click',loadIncidents);$v('v2IncidentSearch')?.addEventListener('input',renderIncidents);$v('v2IncidentStatus')?.addEventListener('change',renderIncidents);$v('v2IncidentChannel')?.addEventListener('change',renderIncidents);$v('v2ExportIncidents')?.addEventListener('click',exportIncidents);
    $v('v2TaskForm')?.addEventListener('submit',createTask);$v('v2RefreshTasks')?.addEventListener('click',loadTasks);$v('v2RefreshAudit')?.addEventListener('click',loadAuditLog);$v('v2ExportOrgBundle')?.addEventListener('click',exportOrgBundle);
    $v('v2PlanRoute')?.addEventListener('click',planRoute);$v('v2UseSiteOrigin')?.addEventListener('click',()=>{if(typeof state!=='undefined' && state.sites?.length){setInput('v2RouteFromLat',state.sites[0].lat);setInput('v2RouteFromLon',state.sites[0].lon);}else toast('Register a monitored site first.','warning');});
    $v('v2NotifyForm')?.addEventListener('submit',sendNotification);$v('v2RefreshMessages')?.addEventListener('click',loadMessages);
    $v('v2OpenCommunity')?.addEventListener('click',()=>{const u=getInput('v2CommunityUrl');if(u)window.open(u,'_blank','noopener');});
    document.addEventListener('click',async e=>{
      const cp=e.target.closest('[data-copy]');if(cp){copyFrom(cp.dataset.copy);return;}
      const b=e.target.closest('[data-v2-action]');if(!b)return;const id=b.dataset.id,act=b.dataset.v2Action;
      if(act==='verify'){await updateIncident(id,{verification_status:'verified',verified_by:cloud.user?.id,verified_at:new Date().toISOString()});}
      if(act==='triage'){await triageIncident(id);}
      if(act==='task'){setInput('v2TaskIncident',id);setInput('v2TaskTitle','Follow up incident '+(V2.incidents.find(x=>x.id===id)?.incident_ref||''));go('response');$v('v2TaskTitle')?.focus();}
      if(act==='task-delete'){try{if(!confirm('Delete this response task?'))return;const r=await cloud.client.from('fb_response_tasks').delete().eq('id',id).eq('org_id',cloud.org.id);if(r.error)throw r.error;V2.tasks=V2.tasks.filter(x=>x.id!==id);renderTasks();toast('Task deleted.');}catch(err){toast(err.message,'error');}}
    });
    document.addEventListener('change',async e=>{
      if(e.target.matches('[data-v2-status]')){await updateIncident(e.target.dataset.v2Status,{status:e.target.value});}
      if(e.target.matches('[data-v2-task-status]')){try{const r=await cloud.client.from('fb_response_tasks').update({status:e.target.value,updated_at:new Date().toISOString()}).eq('id',e.target.dataset.v2TaskStatus).eq('org_id',cloud.org.id).select().single();if(r.error)throw r.error;const i=V2.tasks.findIndex(x=>x.id===r.data.id);if(i>=0)V2.tasks[i]=r.data;toast('Task status updated.');}catch(err){toast(err.message,'error');}}
    });
    window.addEventListener('floodbridge-cloud-ready',()=>{V2.loadedOrg=null;V2.settingsLoaded=false;startV2Realtime();loadSettings();loadIncidents();loadTasks();fillTaskAssignees();});
    window.addEventListener('floodbridge-signed-out',()=>{if(V2.realtime&&cloud.client)cloud.client.removeChannel(V2.realtime);V2.realtime=null;V2.realtimeOrg=null;V2.incidents=[];V2.tasks=[];V2.channels={};V2.profile={};V2.loadedOrg=null;V2.settingsLoaded=false;});
  }
  window.renderV2Page=async function(page){
    if(!['incidents','response','integrations','community','routes','notifications','reports'].includes(page))return;
    if(!hasCloud()){
      if(page==='integrations')notice('v2Readiness','Connect Supabase and sign in to load organisation settings.','');
      if(page==='incidents')notice('v2IncidentTable','Connect Supabase and sign in to view the institution incident inbox.','');
      if(page==='response')notice('v2TaskTable','Connect Supabase and sign in to manage response tasks.','');
      if(page==='community'){const u=new URL('community.html',location.href);if(cfg().publicOrgId)u.searchParams.set('org_id',cfg().publicOrgId);setInput('v2CommunityUrl',u.href);}
      return;
    }
    if(V2.loadedOrg!==cloud.org.id){V2.loadedOrg=null;V2.settingsLoaded=false;}
    startV2Realtime();
    if(page==='integrations'||page==='community')await loadSettings();
    if(page==='incidents'||page==='routes'){await loadIncidents();if(page==='routes')renderRouteHazards();if(page==='incidents')setTimeout(renderIncidentMap,120);}
    if(page==='response'){await loadIncidents();await loadTasks();}
    if(page==='notifications')await loadMessages();
    if(page==='reports')await loadAuditLog();
  };
  window.FloodBridgeV2={refresh:async()=>{V2.loadedOrg=null;V2.settingsLoaded=false;await loadSettings();await loadIncidents();await loadTasks();},exportIncidents,getIncidentCache:()=>V2.incidents,exportTasks,exportOrgBundle};
  bind();
  // URL routing for the separate public portal hand-off is deliberately explicit.
  if(new URLSearchParams(location.search).get('community')==='1') setTimeout(()=>go('community'),0);
})();
