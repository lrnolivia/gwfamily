import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRecord,clone,pageContentFingerprint,pageContentDirty,reconcilePageSave,pageCanAutosave} from '../src/page-content-model.js';

function draftRecord(){
 const record={...initialRecord('home'),canEdit:true,status:'ready',revision:3};
 record.draft=clone(record.content);record.draft.text.heading='First change';record.base=clone(record.content);
 return record;
}
test('a completed autosave retains newer typing and rebases it onto the saved revision',()=>{
 const submitted=draftRecord(),fingerprint=pageContentFingerprint(submitted.draft),current=clone(submitted);
 current.draft.text.heading='Typing continued during the request';
 const saved={page:'home',revision:4,content:clone(submitted.draft),canEdit:true};
 const next=reconcilePageSave('home',saved,current,fingerprint,'Saved for the family');
 assert.equal(next.content.text.heading,'First change');
 assert.equal(next.draft.text.heading,'Typing continued during the request');
 assert.equal(next.base.text.heading,'First change');assert.equal(next.revision,4);
 assert.ok(pageContentDirty(next));assert.ok(pageCanAutosave(next));
 next.draft.text.heading='Changed again';assert.notEqual(next.draft.text.heading,current.draft.text.heading);
});
test('a save with no newer edits clears the draft and cannot schedule another write',()=>{
 const current=draftRecord(),saved={page:'home',revision:4,content:clone(current.draft),canEdit:true};
 const next=reconcilePageSave('home',saved,current,pageContentFingerprint(current.draft),'Saved for the family');
 assert.equal(next.draft,null);assert.equal(next.base,null);assert.equal(pageCanAutosave(next),false);
});
test('autosave stops for conflicts, errors, permission loss and in-flight requests',()=>{
 const record=draftRecord();assert.ok(pageCanAutosave(record));
 for(const delta of [{canEdit:false},{status:'saving'},{status:'loading'},{error:'Offline'},{latest:{revision:4}},{conflicted:true}])assert.equal(pageCanAutosave({...record,...delta}),false);
});
