// Run only in the authorized canonical GitHub CI lane. No suite is filtered.
import {spawn} from 'node:child_process';
import {testFailureAnnotations,testFailureCommand,testSuiteCounts,buildFailureAnnotation,browserFailureAnnotation} from './ci-test-summary-model.mjs';
const suite=/^[A-Za-z0-9 _-]{1,40}$/.test(process.argv[2]||'')?process.argv[2]:'GW suite';
const build=process.argv[3]==='--build';
const browser=process.argv[3]==='--browser',browserPath=process.argv[4];
const requiredBrowsers=new Set(['recovery-browser','hotfix-browser','media-browser','live-browser','communications-browser','navigation-insets-browser','page-content-browser','granular-panel-framing-browser','card-content-layout-browser','family-invitations-browser','choice-control-browser','notifications-browser','install-tutorial-browser','webkit-memory-reload','webkit-diagnostics'].map(name=>'tests/'+name+'.mjs'));
if(process.argv[3]&&!build&&!browser||browser&&!requiredBrowsers.has(browserPath)||process.argv[5])throw Error('Only the existing complete suite, build or named required browser command is supported');
let captured='',truncated=false,started=false;
const child=spawn(browser?'node':'npm',browser?[browserPath]:build?['run','build']:['test'],{cwd:process.cwd(),env:process.env,stdio:['inherit','pipe','pipe']});
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
  const records=browser?[browserFailureAnnotation(captured)]:build?[buildFailureAnnotation(captured)]:testFailureAnnotations(captured);
  for(const record of records)process.stdout.write(testFailureCommand(record,suite)+'\n');
  if(!records.length)process.stdout.write(testFailureCommand({title:'Suite failed before TAP diagnostics',message:'The full required suite failed. Read the original raw log; no test was filtered or skipped.'},suite)+'\n');
  if(truncated)process.stdout.write('::notice::Bounded failure annotations reached their size limit; original raw log remains complete.\n');
 }
 process.exitCode=started?exitCode:1;
});
