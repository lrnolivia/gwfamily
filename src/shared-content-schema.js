import {validateCardLayouts} from './card-content-layout-model.js';
import {photoFramePayload} from './photo-framing-model.js';
import {defaultPanelLayout,validatePanelLayout} from './shared-panels.js';
// Shared copy only. Navigation, accounts, profiles, posts and private records are
// deliberately absent. Defaults remain source-controlled; the API stores overrides.
const text=(label,value,maxLength=160)=>Object.freeze({label,type:'text',maxLength,default:value});
const body=(label,value,maxLength=1500)=>Object.freeze({label,type:'multiline',format:/heading/i.test(label)?'plain':'markdown',maxLength,default:value});
const page=(label,fields)=>Object.freeze({label,hero:true,fields:Object.freeze(fields)});
export const SHARED_CONTENT_LIMITS=Object.freeze({maxGalleryItems:10,maxMediaBytes:20*1024*1024,maxContentBytes:32768,maxAltLength:240});
export const SHARED_IMAGE_TYPES=Object.freeze(['image/jpeg','image/png','image/webp','image/gif']);
export const SHARED_VIDEO_TYPES=Object.freeze(['video/mp4','video/webm']);
export const SHARED_PAGE_SCHEMA=Object.freeze({
 'leader-calendar':Object.freeze({label:'Calendar & Events',hero:false,fields:Object.freeze({})}),
 global:Object.freeze({label:'Shared footer',hero:false,fields:Object.freeze({footerTagline:text('Family tagline','Green & White. Same roots. New memories.',240)})}),
 home:page('Home',{
  heading:text('Page heading','Hey, family!'),heroEyebrow:text('Hero eyebrow','The next reunion',80),heroTitle:body('Hero heading','More time\nwith our people.',240),heroBodyFallback:body('Reunion date placeholder','Dates and location are on the way.'),feedTitle:text('Feed heading','Family feed'),reunionTitle:text('Reunion card heading','Your reunion'),
  nextRsvpTitle:text('RSVP next-step heading','RSVP for your household'),nextRsvpBody:body('RSVP next-step copy','Let us know you’re coming.'),nextShirtsTitle:text('Shirts next-step heading','Choose your family shirts'),nextShirtsBody:body('Shirts next-step copy','Your RSVP is saved. Shirts are next.'),nextFeesTitle:text('Fees next-step heading','Send your share'),nextFeesBody:body('Fees next-step copy','Your plans are saved. Fees are next.')
 }),
 reunion:page('Reunion',{
  heading:text('Page heading','Let’s make memories.'),intro:body('Introduction','Everything you need for our next time together.'),heroEyebrow:text('Hero eyebrow','In the works',80),heroTitle:text('Hero heading','More time with our people.'),dateFallback:text('Date placeholder','Dates to be announced'),locationFallback:text('Location placeholder','Location to be announced'),pricingNote:body('Planning note','Shirt prices, deadlines and contribution amounts will be confirmed by the planners.'),plansTitle:text('Plans heading','Your plans'),weekendTitle:text('Weekend heading','The weekend'),weekendEmptyTitle:text('Weekend placeholder heading','Good things are coming.'),weekendEmptyBody:body('Weekend placeholder copy','The planning crew will add the schedule here.'),clarityTitle:text('Clarity heading','A little clarity'),clarityBody:body('Clarity copy','Shirt choices and contributions stay together. You can see what you selected, what you’ve sent, and what the treasurer has confirmed.'),scheduleEmptyTitle:text('Calendar placeholder heading','The schedule is on its way.'),scheduleEmptyBody:body('Calendar placeholder copy','The planning crew will add activities and times here.')
 }),
 'reunion-plans':page('Reunion Plan',{heading:text('Plan heading','Your plans'),rsvpTitle:text('RSVP heading','RSVP'),merchandiseTitle:text('Merchandise heading','Merchandise'),feesTitle:text('Fees heading','Reunion fees'),checklistTitle:text('Checklist heading','Your reunion')}),
 'reunion-calendar':page('Reunion Calendar',{heading:text('Calendar heading','Reunion calendar')}),
 family:page('Family',{heading:text('Page heading','Our family.'),intro:body('Introduction','People, memories, and the stories that connect us.'),inviteTitle:text('Invitations card heading','Bring your people.'),inviteBody:body('Invitations card copy','Share your invitation link and make room for more family memories.')}),
 people:page('People',{
  heading:text('Address book heading','Address book'),intro:body('Address book introduction','A trusted place for the details each person chooses to share.'),sharingNote:body('Sharing note','Contact cards are opt-in. Sharing a detail is your choice.'),emptyTitle:text('Empty card heading','Start with your own card.'),emptyBody:body('Empty card copy','Add your details, then choose who can see them. No contact information is shared yet.'),profilesTitle:text('Profiles heading','Your family profiles'),peopleTitle:text('People heading','Our people'),sharedTitle:text('Shared cards heading','Shared with you'),sharedEmptyBody:body('No shared contact cards','No family contact cards have been shared with you yet.'),noResults:body('No matching people','No people match these filters.')
 }),
 memories:page('Memories',{heroEyebrow:text('Hero eyebrow','Memory lane',80),heroTitle:body('Hero heading','Little moments.\nBig stories.',240),heroBody:body('Hero copy','The photos and stories we keep coming back to.'),listTitle:text('Gallery heading','Shared memories'),emptyBody:body('No matching memories','No memories match these filters.')}),
 tree:page('Family tree',{heroTitle:text('Hero heading','Our roots run deep.'),heroBody:body('Hero copy','Remembering those who came before us.'),memorialsTitle:text('Memorials heading','Held in our hearts'),connectionsTitle:text('Connections heading','Family connections'),connectionsBody:body('Connections note','Only confirmed connections are shown. Close family groups do not imply parentage.')}),
 birthdays:page('Birthdays',{heading:text('Page heading','Family birthdays'),monthTitle:text('Month heading prefix','Birthdays in',80),emptyBody:body('Empty month copy','No shared birthdays this month.'),privacyNote:body('Birthday privacy note','Only adult members who opt in appear here. Your birth year and household birthdays stay private.')}),
 shop:page('Shop',{heading:text('Page heading','Family merchandise'),emptyBody:body('Empty shop copy','The leaders haven’t added merchandise yet.')}),
 inbox:page('Messages',{eyebrow:text('Page eyebrow','Keep in touch',80),heading:text('Page heading','Messages'),intro:body('Introduction','A private space for your conversations.'),invitationsTitle:text('Invitations heading','Invitations'),emptyTitle:text('Empty inbox heading','A little hello goes a long way.'),emptyBody:body('Empty inbox copy','Choose a family member or bring a group together.'),caughtUpTitle:text('Caught-up heading','You’re all caught up.'),caughtUpBody:body('Caught-up copy','There are no conversations on this page.')}),
 you:page('You',{greetingPrefix:text('Greeting before your name','Hi,',40),intro:body('Introduction','A familiar face in the family.'),toolsTitle:text('Leader section heading','Leader Tools'),inviteTitle:text('Invitations card heading','Bring your people.'),inviteBody:body('Invitations card copy','Share your invitation link and make room for more family memories.')})
});
export function sharedPageDefaults(pageId){
 const schema=Object.hasOwn(SHARED_PAGE_SCHEMA,pageId)&&SHARED_PAGE_SCHEMA[pageId];
 if(!schema)throw new Error('Unknown shared page');
 return {text:Object.fromEntries(Object.entries(schema.fields).map(([key,field])=>[key,field.default])),hero:{mode:'default',media:[]},bodyFormats:{},panelLayout:defaultPanelLayout(pageId),cardLayouts:{}};
}
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function keys(value,allowed){if(!record(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw new Error('Unsupported shared content fields');}
export function sharedPlainText(value,maxLength,multiline=false){
 if(typeof value!=='string'||value.length>maxLength)throw new Error(`Use plain text up to ${maxLength} characters`);
 const cleaned=value.normalize('NFC').replace(/<[^>]*>/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g,'').replace(/\r\n?/g,'\n');
 return (multiline?cleaned:cleaned.replace(/[\n\t]+/g,' ')).trim();
}
export function sharedMarkdownSource(value,maxLength=1500){if(typeof value!=='string'||value.length>maxLength||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value))throw Error(`Use body text up to ${maxLength} characters without control characters`);return value;}
// A whole page snapshot is submitted. Omitted copy uses its source default.
// Media transport metadata (URLs/types/names) is output-only, never accepted here.
export function validateSharedPageContent(pageId,value){
 const defaults=sharedPageDefaults(pageId),schema=SHARED_PAGE_SCHEMA[pageId];
 keys(value,['text','hero','panelLayout','bodyFormats','cardLayouts']);const inputText=value.text===undefined?{}:value.text;keys(inputText,Object.keys(schema.fields));
 const copy={...defaults.text},bodyFormats=value.bodyFormats??{};keys(bodyFormats,Object.keys(schema.fields).filter(key=>schema.fields[key].format==='markdown'));if(Object.values(bodyFormats).some(format=>format!=='markdown'))throw Error('Use a supported body text format');
 for(const [key,input]of Object.entries(inputText)){const field=schema.fields[key];copy[key]=bodyFormats[key]==='markdown'?sharedMarkdownSource(input,field.maxLength):sharedPlainText(input,field.maxLength,field.type==='multiline');}
 const hero=value.hero===undefined?defaults.hero:value.hero;keys(hero,['mode','media','frame']);
 if(!['default','image','gallery','video'].includes(hero.mode)||!Array.isArray(hero.media)||!schema.hero&&hero.mode!=='default')throw new Error('Choose a supported hero layout');
 const count=hero.media.length;
 if(hero.mode==='default'?count!==0:hero.mode==='gallery'?count<1||count>SHARED_CONTENT_LIMITS.maxGalleryItems:count!==1)throw new Error('Choose the right number of hero files');
 const seen=new Set(),media=hero.media.map(file=>{
  keys(file,['id','alt','frame']);if(typeof file.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(file.id)||seen.has(file.id))throw new Error('Choose distinct uploaded hero files');seen.add(file.id);
  return {id:file.id,alt:sharedPlainText(file.alt??'',SHARED_CONTENT_LIMITS.maxAltLength),...photoFramePayload(file.frame)};
 });
 const panelLayout=validatePanelLayout(pageId,value.panelLayout,(input,max,multiline)=>multiline?sharedMarkdownSource(input,max):sharedPlainText(input,max));
 const content={text:copy,hero:{mode:hero.mode,media,...photoFramePayload(hero.frame)},bodyFormats:{...bodyFormats},panelLayout,cardLayouts:validateCardLayouts(pageId,panelLayout,value.cardLayouts)};
 if(new TextEncoder().encode(JSON.stringify(content)).byteLength>SHARED_CONTENT_LIMITS.maxContentBytes)throw new Error('Shared page content is too large');
 return content;
}
