import {familyEmailTheme,EMAIL_FONT_ASSETS} from './family-email-theme.mjs';

const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function copy(value,name,{singleLine=false}={}){
 if(typeof value!=='string'||!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||singleLine&&/[\r\n]/.test(value))throw new TypeError(`Invalid ${name}`);
 return value.trim();
}
function actionUrl(value){
 const raw=copy(value,'action URL',{singleLine:true});
 const url=new URL(raw);
 if(url.origin!=='https://greenwhitefamily.com'||url.username||url.password)throw new TypeError('Action must use the family app HTTPS origin');
 return url.href;
}
// Pure rendering API; no email binding, network, database, notification policy or recipient selection.
export function familyUpdateEmail({kind,title,preview,paragraphs,action={label:'Open family app',url:'https://greenwhitefamily.com'},appearance}={}){
 if(!['notification','announcement'].includes(kind))throw new TypeError('Unknown family email kind');
 const subject=copy(title,'title',{singleLine:true}),preheader=copy(preview||subject,'preview',{singleLine:true});
 if(!Array.isArray(paragraphs)||paragraphs.length===0)throw new TypeError('Email requires plain-text paragraphs');
 const content=paragraphs.map(value=>copy(value,'paragraph')),label=copy(action.label,'action label',{singleLine:true}),url=actionUrl(action.url),theme=familyEmailTheme(appearance);
 const font=EMAIL_FONT_ASSETS[theme.font],fontFaces=[font,EMAIL_FONT_ASSETS.body].map(asset=>`@font-face{font-family:'${asset.family}';font-style:normal;font-weight:400;src:url('${asset.url}') format('truetype');font-display:swap}`).join('');
 const category=kind==='announcement'?'Family announcement':'Family update';
 const paragraphHTML=content.map(value=>`<p style="margin:0 0 20px;font-size:16px;line-height:1.65;overflow-wrap:anywhere">${escape(value).replaceAll('\n','<br>')}</p>`).join('');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${theme.mode}"><meta name="supported-color-schemes" content="${theme.mode}"><title>${escape(subject)}</title><style>${fontFaces}
body,table,td,p,a{ -webkit-text-size-adjust:100%;} table{border-collapse:collapse;} img{border:0;} a:focus-visible{outline:3px solid ${theme.text};outline-offset:4px;} @media(max-width:480px){.email-padding{padding:28px 20px!important}.email-title{font-size:30px!important}} @media(prefers-color-scheme:${theme.mode}){.email-background{background-color:${theme.background}!important}.email-surface{background-color:${theme.surface}!important;color:${theme.text}!important}}</style><!--[if mso]><style>body,table,td,p,a{font-family:Arial,Helvetica,sans-serif!important}.email-heading{font-family:${theme.font==='serif'?'Georgia,serif':'Arial,Helvetica,sans-serif'}!important}</style><![endif]--></head>
<body class="email-background" bgcolor="${theme.background}" style="margin:0;padding:0;background-color:${theme.background};color:${theme.text};font-family:${theme.bodyStack}">
<div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${theme.background}" class="email-background" style="background-color:${theme.background}"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="560"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px"><tr><td class="email-surface email-padding" bgcolor="${theme.surface}" style="padding:36px 32px;background-color:${theme.surface};color:${theme.text}">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:40px"><tr><td width="80" valign="middle" style="padding-right:12px"><img src="https://greenwhitefamily.com/tree-artwork.png" width="68" height="48" alt="" style="display:block;width:68px;height:48px;object-fit:contain"></td><td valign="middle" class="email-heading" style="font-family:${theme.headingStack};font-weight:400"><p style="font-size:18px;line-height:1.15;letter-spacing:-.025em;margin:0;white-space:nowrap"><span style="color:${theme.wordmark[0]}">green &amp;</span> <span style="color:${theme.wordmark[1]}">white</span></p><p style="font-size:37px;line-height:1.05;letter-spacing:-.025em;margin:0;color:${theme.wordmark[2]}">family</p></td></tr></table>
<p style="margin:0 0 12px;color:${theme.muted};font-size:13px;line-height:1.5">${category}</p>
<h1 class="email-heading email-title" style="margin:0 0 24px;font-family:${theme.headingStack};font-size:36px;line-height:1.2;font-weight:400;color:${theme.text};overflow-wrap:anywhere">${escape(subject)}</h1>
${paragraphHTML}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 36px"><tr><td bgcolor="${theme.button}" style="background-color:${theme.button};border-radius:28px;mso-padding-alt:16px 24px"><a href="${escape(url)}" style="display:inline-block;padding:16px 24px;border-radius:28px;color:${theme.buttonInk};font-size:16px;line-height:1.4;font-weight:600;text-decoration:none;overflow-wrap:anywhere">${escape(label)}</a></td></tr></table>
<p style="margin:0;color:${theme.muted};font-size:13px;line-height:1.6">Same roots. New memories.</p>
<p style="margin:6px 0 0;color:${theme.muted};font-size:13px;line-height:1.6"><a href="https://greenwhitefamily.com" style="color:${theme.text};text-decoration:underline">Green &amp; White Family</a></p>
</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
 const text=['Green & White Family',category,subject,...content,`${label}: ${url}`,'Same roots. New memories.','https://greenwhitefamily.com'].join('\n\n');
 return {subject,preview:preheader,html,text,theme};
}
export const notificationEmail=input=>familyUpdateEmail({...input,kind:'notification'});
export const announcementEmail=input=>familyUpdateEmail({...input,kind:'announcement'});
