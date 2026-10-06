// Bounded annotations supplement the unchanged raw TAP output and exit status.
export function testFailureAnnotations(log){
 const text=String(log||''),starts=[...text.matchAll(/^not ok\s+\d+\s*-\s*(.+)$/gm)];
 return starts.slice(0,24).map((match,index)=>{
  const end=starts[index+1]?.index??text.length,block=text.slice(match.index,Math.min(end,match.index+6000));
  const location=/\blocation:\s*['"]([^'"\n]+?):(\d+):(\d+)['"]/.exec(block);
  const full=location?.[1]||'',marker=full.includes('/backend/tests/')?'/backend/tests/':'/tests/',at=full.lastIndexOf(marker);
  const path=at>=0?full.slice(at+1):/^(?:backend\/)?tests\//.test(full)?full:undefined;
  const detail=block.split('\n').filter(line=>/^\s*(?:failureType:|error:|code:|operator:)/.test(line)).slice(0,5).join('\n');
  return {title:match[1].slice(0,180),...(path?{path,line:Number(location[2])}:{}),message:(match[1]+(detail?'\n'+detail:'')).slice(0,1400)};
 });
}
const commandData=value=>String(value).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
const commandProperty=value=>commandData(value).replaceAll(':','%3A').replaceAll(',','%2C');
export function testFailureCommand(record,suite='GW suite'){
 const properties=['title='+commandProperty(suite+': '+record.title)];
 if(record.path){properties.push('file='+commandProperty(record.path),'line='+String(record.line||1));}
 return '::error '+properties.join(',')+'::'+commandData(record.message);
}
