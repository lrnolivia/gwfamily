import {familyEmailTheme,EMAIL_FONT_ASSETS} from './family-email-theme.mjs';
// Approved transactional emails: stock green, Momo Trust Display headings, and
// both light and dark in one message (the reader's mail app picks). Same
// palette, wordmark, oak and flat CTA as the family update renderer. Pure
// rendering: no send path, recipient lookup or appearance persistence.
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function copy(value,name,{singleLine=false,max=2000}={}){
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||singleLine&&/[\r\n]/.test(value))throw new TypeError(`Invalid ${name}`);
 return value.trim();
}
// Links go only to the family app's own HTTPS origin, with no credentials.
// Loopback http is accepted only for local fictional previews and tests.
function actionUrl(value,origin){
 const raw=copy(value,'action URL',{singleLine:true}),url=new URL(raw),allowed=new URL(origin),loopback=allowed.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(allowed.hostname);
 if(allowed.protocol!=='https:'&&!loopback||url.origin!==allowed.origin||url.username||url.password)throw new TypeError('Action must use the family app HTTPS origin');
 return url.href;
}
const light=familyEmailTheme({theme:'light',headingFont:'sans'}),dark=familyEmailTheme({theme:'dark',headingFont:'sans'});
const fontFaces=[EMAIL_FONT_ASSETS.sans,EMAIL_FONT_ASSETS.body].map(asset=>`@font-face{font-family:'${asset.family}';font-style:normal;font-weight:400;src:url('${asset.url}') format('truetype');font-display:swap}`).join('');
// Dark mode swaps every color by class; inline light colors are the fallback for
// clients that ignore the media query.
const darkCss=`@media (prefers-color-scheme:dark){.gw-bg{background-color:${dark.background}!important}.gw-surface{background-color:${dark.surface}!important;color:${dark.text}!important}.gw-text{color:${dark.text}!important}.gw-muted{color:${dark.muted}!important}.gw-wm0{color:${dark.wordmark[0]}!important}.gw-wm1{color:${dark.wordmark[1]}!important}.gw-wm2{color:${dark.wordmark[2]}!important}.gw-button{background-color:${dark.button}!important}.gw-button-ink{color:${dark.buttonInk}!important}.gw-code{background-color:${dark.background}!important;color:${dark.text}!important}}`;
function shell({subject,heading,preheader,category,contentHTML,textParts,origin}){
 const home=new URL(origin).href;
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escape(subject)}</title><style>${fontFaces}
body,table,td,p,a{-webkit-text-size-adjust:100%} table{border-collapse:collapse} img{border:0} a:focus-visible{outline:3px solid currentColor;outline-offset:4px} @media(max-width:480px){.email-padding{padding:28px 20px!important}.email-title{font-size:30px!important}.gw-code{font-size:30px!important;letter-spacing:4px!important}} ${darkCss}</style><!--[if mso]><style>body,table,td,p,a{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]--></head>
<body class="gw-bg" bgcolor="${light.background}" style="margin:0;padding:0;background-color:${light.background};color:${light.text};font-family:${light.bodyStack}">
<div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${light.background}" class="gw-bg" style="background-color:${light.background}"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="560"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px"><tr><td class="gw-surface email-padding" bgcolor="${light.surface}" style="padding:36px 32px;background-color:${light.surface};color:${light.text}">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:40px"><tr><td width="80" valign="middle" style="padding-right:12px"><img src="https://greenwhitefamily.com/tree-artwork.png" width="68" height="48" alt="" style="display:block;width:68px;height:48px;object-fit:contain"></td><td valign="middle" style="font-family:${light.headingStack};font-weight:400"><p style="font-size:18px;line-height:1.15;letter-spacing:-.025em;margin:0;white-space:nowrap"><span class="gw-wm0" style="color:${light.wordmark[0]}">green &amp;</span> <span class="gw-wm1" style="color:${light.wordmark[1]}">white</span></p><p class="gw-wm2" style="font-size:37px;line-height:1.05;letter-spacing:-.025em;margin:0;color:${light.wordmark[2]}">family</p></td></tr></table>
<p class="gw-muted" style="margin:0 0 12px;color:${light.muted};font-size:13px;line-height:1.5">${escape(category)}</p>
<h1 class="gw-text email-title" style="margin:0 0 24px;font-family:${light.headingStack};font-size:36px;line-height:1.2;font-weight:400;color:${light.text};overflow-wrap:anywhere">${escape(heading)}</h1>
${contentHTML}
<p class="gw-muted" style="margin:0;color:${light.muted};font-size:13px;line-height:1.6">Same roots. New memories.</p>
<p class="gw-muted" style="margin:6px 0 0;color:${light.muted};font-size:13px;line-height:1.6"><a class="gw-text" href="${escape(home)}" style="color:${light.text};text-decoration:underline">Green &amp; White Family</a></p>
</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
 const text=['Green & White Family',category,...textParts,'Same roots. New memories.',home].join('\n\n');
 return {subject,preview:preheader,html,text};
}
const paragraph=(value,{muted=false,small=false}={})=>`<p class="${muted?'gw-muted':'gw-text'}" style="margin:0 0 20px;font-size:${small?14:16}px;line-height:1.65;color:${muted?light.muted:light.text};overflow-wrap:anywhere">${escape(value)}</p>`;
const button=(label,url)=>`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 28px"><tr><td class="gw-button" bgcolor="${light.button}" style="background-color:${light.button};border-radius:28px;mso-padding-alt:16px 24px"><a class="gw-button-ink" href="${escape(url)}" style="display:inline-block;padding:16px 24px;border-radius:28px;color:${light.buttonInk};font-size:16px;line-height:1.4;font-weight:600;text-decoration:none;overflow-wrap:anywhere">${escape(label)}</a></td></tr></table>`;
// If the button does not render, the plain link is still there to copy.
const fallbackLink=url=>`<p class="gw-muted" style="margin:0 0 24px;font-size:13px;line-height:1.6;color:${light.muted};overflow-wrap:anywhere">If the button doesn’t work, copy this link: <a class="gw-text" href="${escape(url)}" style="color:${light.text}">${escape(url)}</a></p>`;
const NOT_REQUESTED='If you didn’t ask for this, you can ignore this email. Nobody can sign in without it.';
export function signInCodeEmail(otp,{origin='https://greenwhitefamily.com'}={}){
 const code=copy(String(otp),'code',{singleLine:true,max:12});if(!/^[0-9A-Za-z]{4,12}$/.test(code))throw new TypeError('Invalid code');
 const body=[paragraph('Enter this code in the family app to sign in.'),`<p class="gw-code" role="text" aria-label="Sign-in code ${escape(code.split('').join(' '))}" style="margin:0 0 20px;padding:20px 12px;text-align:center;background-color:${light.background};border-radius:12px;color:${light.text};font:700 36px/1.3 ${light.bodyStack};letter-spacing:6px">${escape(code)}</p>`,paragraph('This code expires in 10 minutes and can only be used once. Never share it with anyone.',{small:true}),paragraph(NOT_REQUESTED,{muted:true,small:true})].join('');
 return shell({subject:'Your Green & White sign-in code',heading:'Come on in.',preheader:'Your sign-in code. Valid for ten minutes.',category:'Sign in',contentHTML:body,origin,textParts:['Come on in.',`Your code is ${code}.`,'It expires in 10 minutes and can only be used once. Never share it with anyone.',NOT_REQUESTED]});
}
export function signInLinkEmail(url,{origin='https://greenwhitefamily.com'}={}){
 const href=actionUrl(url,origin);
 const body=[paragraph('Use this private link to sign in to your family space.'),button('Sign in to Green & White',href),fallbackLink(href),paragraph('This link works once and expires in 10 minutes. Never forward it.',{small:true}),paragraph(NOT_REQUESTED,{muted:true,small:true})].join('');
 return shell({subject:'Sign in to Green & White',heading:'Come on in.',preheader:'Your secure sign-in link.',category:'Sign in',contentHTML:body,origin,textParts:['Come on in.',`Sign in: ${href}`,'This link works once and expires in 10 minutes. Never forward it.',NOT_REQUESTED]});
}
export function familyInviteEmail({url,origin='https://greenwhitefamily.com'}){
 const href=actionUrl(url,origin);
 const body=[paragraph('A family member invited you to Green & White, our private family space. Sign in with this email address, complete your profile, and accept the invitation.'),paragraph('An organizer still approves every membership. The link alone doesn’t grant access.',{small:true}),button('View invitation',href),fallbackLink(href),paragraph('This invitation expires in seven days.',{muted:true,small:true})].join('');
 return shell({subject:'You’re invited to Green & White Family',heading:'You’re invited.',preheader:'Join your family on Green & White.',category:'Family invitation',contentHTML:body,origin,textParts:['You’re invited.','A family member invited you to Green & White. Sign in with this email address, complete your profile, and accept the invitation. An organizer still approves every membership.',`View invitation: ${href}`,'This invitation expires in seven days.']});
}
export function householdInviteEmail({householdName,url,origin='https://greenwhitefamily.com'}){
 const name=copy(householdName,'household name',{singleLine:true,max:100}),href=actionUrl(url,origin);
 const body=[paragraph(`A head of ${name} invited you to join their household. Sign in with this email address, then choose whether to accept.`),button('View invitation',href),fallbackLink(href),paragraph('This invitation expires in seven days. You’ll need an approved family account; the link doesn’t grant access by itself.',{muted:true,small:true})].join('');
 return shell({subject:'An invitation to '+name,heading:'You’re invited.',preheader:'An invitation to join '+name+'.',category:'Household invitation',contentHTML:body,origin,textParts:['You’re invited.',`A head of ${name} invited you to join their household in Green & White Family. Sign in with this email address and choose whether to accept.`,`View invitation: ${href}`,'This invitation expires in seven days. Joining requires an approved family account.']});
}
