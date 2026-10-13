import {EditableText} from './page-content.jsx';
import React from 'react';
import {Control,Button,Glyph,Avatar,MemberBadges,useApp} from './ui-core.jsx';
import {derivePlanning} from './planning-model.js';
import './planning-checklist.css';
const statusIcons={complete:'check',todo:'arrow',pending:'clock',waiting:'clock','not-needed':'close',review:'help',private:'lock'};
export function PlanningStatus({task}){return <span className={'planning-status is-'+task.status}><Glyph name={statusIcons[task.status]||'info'} className="planning-status-mark"/><span>{task.statusLabel}</span></span>}
export function PlanningLinks(){const {state,go,openSheet}=useApp(),plan=derivePlanning(state);return <div className="planning-links" aria-label="Your saved planning status">{plan.tasks.map(task=><Control type="button" key={task.id} aria-label={'My '+task.label+' · '+task.statusLabel+' · '+task.detail} className={'list-row planning-link is-'+task.status} onClick={()=>task.id==='rsvp'?openSheet({type:'rsvp'}):go({type:task.destination})}><Glyph name={task.icon}/><span className="planning-link-copy"><span className="planning-link-heading"><strong className="planning-task-label">{task.label}</strong><PlanningStatus task={task}/></span><span className="planning-detail">{task.detail}</span></span><span className="arrow"><Glyph name="arrow"/></span></Control>)}</div>}
// inSheet: the surrounding sheet already supplies the title and card surface.
export function PlanningChecklist({compact=false,title='Your planning checklist',heading,showMembers=false,inSheet=false}){
 const {state,go,openSheet}=useApp(),plan=derivePlanning(state),next=plan.nextTask;
 const people=<ul className="planning-member-list">{plan.members.map(member=><li key={member.memberId} className="planning-member"><div className="planning-member-identity"><Avatar member={state.members?.find(m=>m.id===member.memberId)}/><div><h3>{member.name}{member.memberId===state.selfId?' (you)':''}</h3><p className="small muted">{member.relationship}</p><MemberBadges member={state.members?.find(m=>m.id===member.memberId)}/></div></div><ul className="planning-member-tasks">{member.tasks.map(task=><li key={task.id} className={'planning-member-task is-'+task.status}><span className="planning-task-label">{task.label}</span><PlanningStatus task={task}/><span className="planning-detail">{task.detail}</span></li>)}</ul></li>)}</ul>;
 return <section className={(inSheet?'':'card ')+'planning-checklist'+(compact?' planning-checklist-compact':'')+(inSheet?' planning-checklist-in-sheet':'')} aria-label={title}>
  {!inSheet&&<h2>{heading||title}</h2>}<p className="planning-summary" role="status">{plan.summary}</p>
  {!compact&&next&&<div className="next-step"><EditableText page="home" field={next.id==='rsvp'?'nextRsvpTitle':next.id==='shirts'?'nextShirtsTitle':'nextFeesTitle'} as="strong">{next.id==='rsvp'?'RSVP for your household':next.id==='shirts'?'Choose your family shirts':'Send your share'}</EditableText><EditableText page="home" field={next.id==='rsvp'?'nextRsvpBody':next.id==='shirts'?'nextShirtsBody':'nextFeesBody'} as="span" className="small muted">{next.id==='rsvp'?'Let us know your plans.':next.id==='shirts'?'Your RSVP is saved. Shirts are next.':'Your shirt selection is saved. Fees are next.'}</EditableText></div>}
  {next&&<Button onClick={()=>next.id==='rsvp'?openSheet({type:'rsvp'}):go({type:next.destination})}>{next.id==='rsvp'?'Save your RSVP':next.id==='shirts'?'Choose your shirts':'Review your fees'}<Glyph name="arrow"/></Button>}
  <PlanningLinks/>
  {showMembers?<div className="planning-people"><h3>Family member checklist</h3>{people}</div>:<Button secondary icon="people" onClick={()=>go({type:'family-checklist'})}>Family member checklist</Button>}
  {plan.members.length>1&&<p className="small muted planning-coverage-note">RSVPs and contributions are saved by household account. Orders contain sizes and quantities, so individual coverage still needs checking. Other adults’ plans remain private.</p>}
  {plan.attendance==='not-attending'&&<p className="small muted">You can update your RSVP any time. Existing orders and payments remain available to review.</p>}
 </section>
}
export function SavedPlanningHistory({expanded=false}){
 const {state,go}=useApp(),records=state.planningRecords?.accountId===state.selfId?state.planningRecords:null,orders=records?.orders||state.previewOrders||(state.order?[state.order]:[]),fees=records?.feeReports||state.previewFeeReports||[];
 if(!orders.length&&!fees.length)return expanded?<section className="card stack"><h2>Saved records</h2><p>No orders or contribution reports are saved for this account yet.</p></section>:null;
 if(!expanded)return <Button secondary icon="history" onClick={()=>go({type:'planning-history'})}>Saved orders and contribution records</Button>;
 return <section className="card planning-history"><h2>Saved orders and contribution records</h2><p className="small muted">Changing your RSVP does not cancel orders, delete reports, or request refunds.</p>{orders.length>0&&<><h3>Orders</h3><ul>{orders.map(o=><li key={o.id}><strong>{o.status==='claimed'?'Selection saved':o.status}</strong>{(o.items||[]).length>0&&<span> · {(o.items||[]).map(item=>item.name||item.productId).filter(Boolean).join(', ')}</span>}</li>)}</ul></>}{fees.length>0&&<><h3>Contributions</h3><ul>{fees.map(f=><li key={f.id}>{f.status==='confirmed'?'Confirmed by the treasurer':f.status==='rejected'?'Not received':'Reported · awaiting confirmation'}</li>)}</ul></>}</section>
}

export function FamilyPlanningPage(){return <section className="stack"><h1>Family member checklist</h1><PlanningChecklist showMembers/></section>}
export function PlanningHistoryPage(){return <section className="stack"><h1>Saved planning records</h1><SavedPlanningHistory expanded/></section>}
