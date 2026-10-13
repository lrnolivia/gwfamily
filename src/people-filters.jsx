import React,{useId} from 'react';
import {BrowseControls} from './browse-controls.jsx';
import {Control,Glyph} from './ui-core.jsx';
import {emptyPeopleFilters} from './people-directory-model.js';
import './shared-controls/work-controls.css';
import {workControlGlyph} from './shared-controls/work-controls.js';
import './people-filters.css';
function FilterGlyph({name}){return <span className="filter-shared-glyph" aria-hidden="true" dangerouslySetInnerHTML={{__html:workControlGlyph(name)}}/>}
function FilterChoices({label,options,value,onChange}){return <fieldset className="people-filter-group work-control-field"><legend className="work-control-label">{label}</legend><div className="people-filter-choices work-filter-bar">{options.map(([id,text,icon])=><Control type="button" key={id} className="people-filter-choice" aria-pressed={value===id} onClick={()=>onChange(id)}>{icon&&<Glyph name={icon}/>}<span>{text}</span>{value===id&&<Glyph name="check"/>}</Control>)}</div></fieldset>}
// Reuses the exact approved shared CTRL stylesheet and SVG primitive. React
// owns GW-only state/events; no CTRL review action or protocol is connected.
// Only the GW directory's existing data and actions are exposed here.
export function PeopleFilters({state,value,onChange,management=false,resultCount,defaultOpen=false}){
 const id=useId(),filters={...emptyPeopleFilters,...value},set=(key,next)=>onChange({...filters,[key]:next}),changed=Object.keys(emptyPeopleFilters).some(key=>filters[key]!==emptyPeopleFilters[key]);
 const controls=<div className="people-filter-fields"><FilterChoices label="Show me" value={filters.circle} onChange={next=>set('circle',next)} options={[[ 'all','All family'],['family','Family','people'],['loved','Loved Ones','heart']]}/><div className="people-filter-columns"><label className="people-filter-household" htmlFor={id+'-household'}>Household<select id={id+'-household'} value={filters.household} onChange={event=>set('household',event.target.value)}><option value="all">All households</option><option value="none">No household yet</option>{(state.households||[]).map(household=><option key={household.id} value={household.id}>{household.name}</option>)}</select></label><FilterChoices label="People" value={filters.role} onChange={next=>set('role',next)} options={[[ 'all','Everyone'],['leaders','Family leaders','people']]}/></div>{management&&<FilterChoices label="Membership" value={filters.status} onChange={next=>set('status',next)} options={[[ 'all','All statuses'],['pending','Pending approval','clock'],['active','Active','check'],['suspended','Paused'],['removed','Removed']]}/>}<FilterChoices label="Arrange by" value={filters.sort} onChange={next=>set('sort',next)} options={[[ 'name-asc','Name A–Z'],['name-desc','Name Z–A']]}/></div>;
 return <div className="people-filters"><BrowseControls label="Family directory" search={filters.query} onSearch={next=>set('query',next)} placeholder="Find someone" defaultOpen={defaultOpen} filters={controls}><div className="people-filter-summary"><p className="small muted" role="status">{resultCount} {resultCount===1?'person':'people'} found</p>{changed&&<Control type="button" className="text-button" onClick={()=>onChange({...emptyPeopleFilters})}><Glyph name="close"/>Clear filters</Control>}</div></BrowseControls></div>;
}
