import React from 'react';
import {Control,Glyph} from './ui-core.jsx';
// Files that didn't upload, each with Retry and Remove. Successful files stay attached.
export function FailedUploads({items,busy,onRetry,onRemove}){
 if(!items?.length)return null;
 return <ul className="failed-uploads" aria-label="Files that didn’t upload">{items.map(item=><li key={item.key} className="draft-file is-failed"><span><strong>{item.file.name}</strong><small role="alert">{item.error}</small></span><Control type="button" disabled={busy} aria-label={'Retry '+item.file.name} onClick={()=>onRetry(item)}><Glyph name="history"/></Control><Control type="button" disabled={busy} aria-label={'Remove '+item.file.name} onClick={()=>onRemove(item)}><Glyph name="close"/></Control></li>)}</ul>;
}
