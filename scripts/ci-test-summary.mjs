// Run only in the authorized canonical GitHub CI lane. No suite is filtered.
import {spawn} from 'node:child_process';
import {testFailureAnnotations,testFailureCommand,testSuiteCounts} from './ci-test-summary-model.mjs';
const suite=/^[A-Za-z0-9 _-]{1,40}$/.test(process.argv[2]||'')?process.argv[2]:'GW suite';
let captured='',truncated=false,started=false;
const child=spawn('npm',['test'],{cwd:process.cwd(),env:process.env,stdio:['inherit','pipe','pipe']});
function capture(chunk){const text=chunk.toString();if(captured.length+text.length<=2*1024*1024)captured+=text;else truncated=true;}
child.stdout.on('data',chunk=>{process.stdout.write(chunk);capture(chunk)});
child.stderr.on('data',chunk=>{process.stderr.write(chunk);capture(chunk)});
child.on('spawn',()=>{started=true});
child.on('error',error=>{process.stderr.write(String(error.message)+'\n');process.exitCode=1});
child.on('close',(code,signal)=>{
 const exitCode=typeof code==='number'?code:1;
 const counts=testSuiteCounts(captured);
 if(counts)process.stdout.write('::notice::'+suite+' complete required-suite counts '+JSON.stringify(counts)+'; exit '+exitCode+'\n');
 if(exitCode!==0){
  const records=testFailureAnnotations(captured);
  for(const record of records)process.stdout.write(testFailureCommand(record,suite)+'\n');
  if(!records.length)process.stdout.write(testFailureCommand({title:'Suite failed before TAP diagnostics',message:'The full required suite failed. Read the original raw log; no test was filtered or skipped.'},suite)+'\n');
  if(truncated)process.stdout.write('::notice::Bounded failure annotations reached their size limit; original raw log remains complete.\n');
 }
 process.exitCode=started?exitCode:1;
});
