import React from 'react';
import {BrowseControls as SharedBrowseControls} from './shared-controls/work-controls-react.jsx';
import {Glyph} from './ui-core.jsx';
import './shared-controls/work-controls-shell.css';
import './shared-controls/work-controls.css';
import './browse-controls.css';
export {SharedControlGlyph} from './shared-controls/work-controls-react.jsx';
// Version-pinned @relay/shared-ui 1.1.0; GW contributes domain tokens/actions only.
export function BrowseControls({label,placeholder,views=[],...props}){return <SharedBrowseControls {...props} label={label} variant={label==='Memory'?'media':'people'} placeholder={placeholder} searchLabel={placeholder} views={views.map(option=>({...option,label:option.label+' view'}))} renderViewIcon={option=><Glyph name={option.icon}/>}/>}
