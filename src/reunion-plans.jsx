import React from 'react';
import {useApp} from './ui-core.jsx';
import {SharedPagePanels} from './page-panels.jsx';
import {EditableText,EditableMedia,usePageContent} from './page-content.jsx';
import {PlanningChecklist,PlanningStatus,SavedPlanningHistory} from './planning-checklist.jsx';
import {derivePlanning} from './planning-model.js';
import {Rsvp,ReunionFeesPanel} from './planner.jsx';
import {ProductList} from './features.jsx';
import './reunion-plans.css';

export function YourReunionPanel({compact=false,page='home',field='reunionTitle',inSheet=false}){return <PlanningChecklist compact={compact} inSheet={inSheet} title="Your reunion" heading={<EditableText page={page} field={field} as="span">Your reunion</EditableText>}/>}
export function ReunionPlans(){
 const {state}=useApp(),plan=derivePlanning(state),shirts=plan.byId.shirts,legacy=usePageContent('reunion');
 return <div className="stack reunion-plans-page"><SharedPagePanels page="reunion-plans" mediaOnly nativePanels={{
  'native-rsvp':<section className="card stack"><div className="reunion-plan-heading"><EditableText page="reunion-plans" field="rsvpTitle" as="h2">RSVP</EditableText><PlanningStatus task={plan.byId.rsvp}/></div><p className="small muted">{plan.byId.rsvp.detail}</p><Rsvp/></section>,
  'native-merchandise':<section className={'reunion-merchandise-panel stack is-'+shirts.status} aria-label="Merchandise"><div className="reunion-plan-heading"><EditableText page="reunion-plans" field="merchandiseTitle" as="h2" className="planning-task-label">Merchandise</EditableText><PlanningStatus task={shirts}/></div><p className="small muted">{shirts.detail}</p>{shirts.status==='not-needed'||shirts.status==='waiting'?<p>Saved orders remain available below. Update your RSVP if your attendance changes.</p>:<ProductList/>}</section>,
  'native-fees':<ReunionFeesPanel heading={<EditableText page="reunion-plans" field="feesTitle" as="span">Reunion fees</EditableText>}/>,
  'native-checklist':<YourReunionPanel compact page="reunion-plans" field="checklistTitle"/>,
  'native-history':<SavedPlanningHistory/>
 }}><EditableMedia page="reunion-plans" field="hero"/></SharedPagePanels></div>;
}
