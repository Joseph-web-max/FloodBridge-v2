import { json, corsHeaders, getOrgId, requireUser, env } from '../_shared/common.ts';
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return json({error:'POST required.'},405);
  try{
    const body=await req.json();const orgId=String(body.org_id||getOrgId(req));const {db}=await requireUser(req,orgId,['admin']);
    const has=(...names:string[])=>names.every(n=>!!env(n));
    const {data:notifyRow}=await db.from('fb_channels').select('config').eq('org_id',orgId).eq('channel_key','notify').maybeSingle();const notify=notifyRow?.config||{};
    const smsSender=!!(env('TWILIO_FROM')||notify.smsSender);const waPhone=!!(env('META_PHONE_NUMBER_ID')||notify.metaPhoneId);
    return json({integrations:{
      ussd:{ready:has('USSD_WEBHOOK_SECRET')},
      email:{ready:has('SENDGRID_INBOUND_SECRET')},
      meta:{ready:has('META_VERIFY_TOKEN','META_APP_SECRET')},
      sms:{ready:has('TWILIO_AUTH_TOKEN','TWILIO_ACCOUNT_SID')&&smsSender},
      email_out:{ready:has('RESEND_API_KEY','MAIL_FROM')},
      whatsapp_out:{ready:has('META_ACCESS_TOKEN','META_GRAPH_VERSION')&&waPhone},
      ai:{ready:has('OPENAI_API_KEY')},
      routing:{ready:has('ORS_API_KEY')},
      social_bridge:{ready:has('SOCIAL_WEBHOOK_SECRET')},
      community:{ready:has('RATE_LIMIT_PEPPER')}
    },checked_at:new Date().toISOString()});
  }catch(e){return json({error:e.message||'Could not check integration configuration.'},400);}
});
