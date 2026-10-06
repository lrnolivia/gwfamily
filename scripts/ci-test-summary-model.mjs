// Bounded annotations supplement the unchanged raw TAP output and exit status.
export function testFailureAnnotations(log){
 const text=String(log||''),starts=[...text.matchAll(/^not ok\s+\d+\s*-\s*(.+)$/gm)];
 return starts.slice(0,24).map((match,index)=>{
  const end=starts[index+1]?.index??text.length,block=text.slice(match.index,Math.min(end,match.index+6000));
  const location=/\blocation:\s*['"]([^'"\n]+?):(\d+):(\d+)['"]/.exec(block);
  const full=location?.[1]||'',marker=full.includes('/backend/tests/')?'/backend/tests/':'/tests/',at=full.lastIndexOf(marker);
  const path=at>=0?full.slice(at+1):/^(?:backend\/)?tests\//.test(full)?full:undefined;
  const lines=block.split('\n'),details=lines.filter(line=>/^\s*(?:failureType:|error:|code:|operator:)/.test(line)).slice(0,5);
  const multiline=lines.findIndex(line=>/^\s*error:\s*\|/.test(line));
  if(multiline>=0){
   // A TAP block error often puts the useful sentence below "error: |-".
   // Exclude serialized input/stack dumps, retain just the bounded leading reason.
   for(const line of lines.slice(multiline+1,multiline+8)){
    if(/^\s*(?:code:|operator:|expected:|actual:|stack:|Input:|Received:|Actual:|\.{3}|\|)/.test(line))break;
    if(line.trim())details.push(line.slice(0,500));
   }
  }
  if(details.some(line=>/ERR_TEST_FAILURE/.test(line))){
   const previous=starts[index-1]?.index??0,prefix=text.slice(Math.max(previous,match.index-8000),match.index);
   const startup=prefix.split('\n').filter(line=>/^#\s*(?:Error\b|SyntaxError\b|TypeError\b|ReferenceError\b|.*\[ERROR\]|.*No matching export|.*Could not resolve|.*Cannot find module)/.test(line)).slice(-4);
   details.push(...startup.map(line=>line.slice(0,500)));
  }
  const detail=details.join('\n');
  return {title:match[1].slice(0,180),...(path?{path,line:Number(location[2])}:{}),message:(match[1]+(detail?'\n'+detail:'')).slice(0,1400)};
 });
}
const commandData=value=>String(value).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
export function testSuiteCounts(log){
 const counts={};for(const match of String(log||'').matchAll(/^#\s+(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+(\d+(?:\.\d+)?)/gm))counts[match[1]]=Number(match[2]);
 return Number.isFinite(counts.tests)&&Number.isFinite(counts.pass)&&Number.isFinite(counts.fail)?counts:null;
}
const commandProperty=value=>commandData(value).replaceAll(':','%3A').replaceAll(',','%2C');
export function testFailureCommand(record,suite='GW suite'){
 const properties=['title='+commandProperty(suite+': '+record.title)];
 if(record.path){properties.push('file='+commandProperty(record.path),'line='+String(record.line||1));}
 return '::error '+properties.join(',')+'::'+commandData(record.message);
}
