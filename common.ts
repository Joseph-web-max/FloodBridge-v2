import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-floodbridge-signature, x-twilio-signature, x-hub-signature-256',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
export function json(body: unknown, status = 200, headers: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type':'application/json', ...headers } });
}
export function text(body: string, status = 200) {
  return new Response(body, { status, headers: { ...corsHeaders, 'Content-Type':'text/plain; charset=utf-8' } });
}
export function env(name: string, fallback = ''): string { return Deno.env.get(name) || fallback; }
function keyFromBundle(name: string): string {
  try { const raw = Deno.env.get(name); if (!raw) return ''; const parsed = JSON.parse(raw); return parsed.default || Object.values(parsed)[0] as string || ''; } catch { return ''; }
}
export function adminClient(): SupabaseClient {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || keyFromBundle('SUPABASE_SECRET_KEYS');
  if (!url || !key) throw new Error('Supabase server URL / secret key is missing in the Edge Function environment.');
  return createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false } });
}
export function getOrgId(req: Request): string {
  const id = new URL(req.url).searchParams.get('org_id') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('A valid organisation ID is required.');
  return id;
}
export function verifyQuerySecret(req: Request, secretName: string): boolean {
  const expected = env(secretName); const given = new URL(req.url).searchParams.get('token') || '';
  return !!expected && !!given && timingSafeEqual(expected, given);
}
export function timingSafeEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a); const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false; let diff = 0; for (let i=0;i<aa.length;i++) diff |= aa[i] ^ bb[i]; return diff === 0;
}
export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function requireUser(req: Request, orgId: string, allowed: string[] = ['admin','editor']) {
  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) throw new Error('Sign-in required.');
  const db = adminClient();
  const { data: userData, error: userError } = await db.auth.getUser(jwt);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid or expired.');
  const { data: membership, error } = await db.from('fb_memberships').select('role').eq('org_id',orgId).eq('user_id',userData.user.id).maybeSingle();
  if (error) throw error;
  if (!membership || !allowed.includes(membership.role)) throw new Error('Your organisation role does not permit this action.');
  return { db, user:userData.user, role:membership.role };
}
export function cleanText(v: unknown, max = 2000): string {
  return String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,' ').trim().slice(0,max);
}
export function validCoord(lat: unknown, lon: unknown): boolean {
  const a=Number(lat), b=Number(lon); return Number.isFinite(a)&&Number.isFinite(b)&&a>=-90&&a<=90&&b>=-180&&b<=180;
}
export function makeRef(): string {
  const d=new Date(); const date=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
  return `FB-${date}-${crypto.randomUUID().replace(/-/g,'').slice(0,20).toUpperCase()}`;
}
function normaliseForMatch(value: unknown): string {
  return cleanText(value, 5000).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function wordSimilarity(a: string, b: string): number {
  const aa = new Set(a.split(' ').filter(w => w.length > 2));
  const bb = new Set(b.split(' ').filter(w => w.length > 2));
  if (!aa.size || !bb.size) return 0;
  let overlap = 0; for (const w of aa) if (bb.has(w)) overlap++;
  return overlap / (aa.size + bb.size - overlap);
}
async function findPotentialDuplicate(db: SupabaseClient, orgId: string, category: string, location: string, description: string) {
  const loc = normaliseForMatch(location);
  if (!loc || loc.length < 3) return null;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from('fb_incidents')
    .select('id,incident_ref,category,location_text,description,created_at')
    .eq('org_id', orgId).gte('created_at', since).order('created_at', { ascending: false }).limit(100);
  if (error) { console.warn('Duplicate check skipped:', error.message); return null; }
  const desc = normaliseForMatch(description);
  for (const old of data || []) {
    const oldLoc = normaliseForMatch(old.location_text);
    if (!oldLoc || oldLoc !== loc) continue;
    const sameCategory = String(old.category || '').toLowerCase() === category.toLowerCase();
    const similarity = wordSimilarity(desc, normaliseForMatch(old.description));
    if ((sameCategory && similarity >= 0.40) || similarity >= 0.78) {
      return { possible_duplicate: true, incident_id: old.id, reference: old.incident_ref, created_at: old.created_at, reason: 'Same reported location and similar description within 24 hours' };
    }
  }
  return null;
}
async function sendIncidentEmailAlert(db: SupabaseClient, incident: any) {
  try {
    const { data: notify } = await db.from('fb_channels').select('config,enabled,status').eq('org_id', incident.org_id).eq('channel_key', 'notify').maybeSingle();
    const recipient = cleanText(notify?.config?.notificationEmail, 200);
    const apiKey = env('RESEND_API_KEY'); const from = env('MAIL_FROM');
    if (!notify?.enabled || notify.status === 'disabled' || !recipient || !apiKey || !from) return;
    const subject = `[FloodBridge] New ${String(incident.severity || 'unknown').toUpperCase()} incident ${incident.incident_ref}`;
    const body = [
      'A new community or field incident has been received by FloodBridge.',
      `Reference: ${incident.incident_ref}`,
      `Category: ${incident.category}`,
      `Severity reported: ${incident.severity}`,
      `Location: ${incident.location_text || 'Not provided'}`,
      `Channel: ${incident.channel}`,
      `Description: ${incident.description}`,
      '',
      'This report is unverified until reviewed by an authorised officer. Do not treat this email as an official warning or dispatch instruction.'
    ].join('\n');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [recipient], subject, text: body }), signal: AbortSignal.timeout(7000)
    });
    const payload = await response.json().catch(() => ({}));
    await db.from('fb_messages').insert({
      org_id: incident.org_id, direction: 'outbound', channel: 'email', sender: from, recipient,
      subject, body_preview: body.slice(0, 500), provider_message_id: payload.id || null,
      delivery_status: response.ok ? 'accepted_by_provider' : 'failed',
      incident_id: incident.id, provider_payload: { provider: 'resend', automatic_incident_alert: true, http_status: response.status }
    });
  } catch (error) {
    console.warn('Automatic incident email alert failed:', error);
    await db.from('fb_messages').insert({ org_id: incident.org_id, direction: 'outbound', channel: 'email', subject: 'FloodBridge automatic incident alert', body_preview: 'Automatic alert could not be delivered. Check provider configuration and logs.', delivery_status: 'failed', incident_id: incident.id, provider_payload: { provider: 'resend', automatic_incident_alert: true } });
  }
}
export async function insertIncident(db: SupabaseClient, input: {
  orgId:string; channel:string; category?:string; severity?:string; location?:string; lat?:unknown; lon?:unknown;
  description:string; reporterName?:string; reporterContact?:string; payload?:unknown; sender?:string; subject?:string;
}) {
  const org = await db.from('fb_orgs').select('id').eq('id',input.orgId).maybeSingle();
  if (org.error) throw org.error; if (!org.data) throw new Error('Organisation not found.');
  const coords=validCoord(input.lat,input.lon);
  const category=cleanText(input.category||'other',80).toLowerCase().replace(/[^a-z0-9_-]/g,'_')||'other';
  const description=cleanText(input.description,5000)||'No description supplied.';
  const location=cleanText(input.location,500);
  const duplicate=await findPotentialDuplicate(db,input.orgId,category,location,description);
  const payload=input.payload && typeof input.payload==='object'?{...(input.payload as Record<string,unknown>)}:{};
  if(duplicate) payload.duplicate_review=duplicate;
  const row={
    org_id:input.orgId, incident_ref:makeRef(), channel:input.channel,
    category, severity:normaliseSeverity(input.severity), location_text:location||null,
    latitude:coords?Number(input.lat):null, longitude:coords?Number(input.lon):null,
    description, reporter_name:cleanText(input.reporterName,120)||null,
    reporter_contact:cleanText(input.reporterContact,180)||null, source_payload:payload,
  };
  const {data,error}=await db.from('fb_incidents').insert(row).select('*').single();
  if(error)throw error;
  await db.from('fb_messages').insert({org_id:input.orgId,direction:'inbound',channel:input.channel,sender:cleanText(input.sender||input.reporterContact,180)||null,subject:cleanText(input.subject,250)||null,body_preview:row.description.slice(0,500),delivery_status:'received',incident_id:data.id,provider_payload:row.source_payload});
  await sendIncidentEmailAlert(db, data);
  return data;
}
export async function requireChannelEnabled(db: SupabaseClient, orgId: string, channelKey: string): Promise<void> {
  const { data, error } = await db.from('fb_channels').select('enabled,status').eq('org_id', orgId).eq('channel_key', channelKey).maybeSingle();
  if (error) throw error;
  if (!data || data.enabled !== true || data.status === 'disabled') throw new Error(`The ${channelKey} channel is not enabled in FloodBridge Integrations.`);
}
export function normaliseSeverity(value: unknown): string {
  const v=cleanText(value,40).toLowerCase();
  if(['low','moderate','medium','high','critical','life-threatening'].includes(v)) return v;
  if(['severe','urgent','very high'].includes(v)) return 'high';
  return 'unknown';
}
export async function enforceRateLimit(db: SupabaseClient, req: Request, limit=8): Promise<boolean> {
  const ip=req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const pepper=env('RATE_LIMIT_PEPPER'); if(!pepper) throw new Error('RATE_LIMIT_PEPPER must be configured before accepting public community reports.');
  const digest=await sha256(`${pepper}:${ip}`);
  const {data,error}=await db.rpc('fb_allow_public_intake',{p_ip_hash:digest,p_limit:limit,p_window_seconds:3600});
  if(error)throw error; return data===true;
}
export async function verifyHmacSha256(secret: string, body: Uint8Array, header: string): Promise<boolean> {
  if (!secret || !header.startsWith('sha256=')) return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,body));
  const hex=[...sig].map(x=>x.toString(16).padStart(2,'0')).join('');
  return timingSafeEqual(`sha256=${hex}`,header);
}
