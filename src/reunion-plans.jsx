import React from 'react';
import {useApp} from './ui-core.jsx';
import {EditableText} from './page-content.jsx';
import {PlanningChecklist,PlanningStatus,SavedPlanningHistory} from './planning-checklist.jsx';
import {derivePlanning} from './planning-model.js';
import {Rsvp,ReunionFeesPanel} from './planner.jsx';
import {ProductList} from './features.jsx';
import './reunion-plans.css';

export function YourReunionPanel(){return <PlanningChecklist compact title="Your reunion" heading={<EditableText page="home" field="reunionTitle" as="span">Your reunion</EditableText>}/>}
export function ReunionPlans(){
 const {state}=useApp(),plan=derivePlanning(state),shirts=plan.byId.shirts;
 return <div className="stack reunion-plans-page"><EditableText page="reunion" field="plansTitle" as="h2">Your plans</EditableText><section className="card stack"><h2>RSVP</h2><PlanningStatus task={plan.byId.rsvp}/><p className="small muted">{plan.byId.rsvp.detail}</p><Rsvp/></section><section className={'reunion-merchandise-panel stack is-'+shirts.status} aria-label="Merchandise"><div className="reunion-plan-heading"><h2>Merchandise</h2><PlanningStatus task={shirts}/></div><p className="small muted">{shirts.detail}</p>{shirts.status==='not-needed'||shirts.status==='waiting'?<p>Saved orders remain available below. Update your RSVP if your attendance changes.</p>:<ProductList/>}</section><ReunionFeesPanel/><PlanningChecklist/><SavedPlanningHistory/></div>;
}
