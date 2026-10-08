// Only for idempotent reads. Mutations retain their receipt-based retry policy.
const aborted = () => new DOMException('The request was canceled.', 'AbortError');
const timeout = () => Object.assign(new Error('The connection timed out. Please try again.'), {name:'TimeoutError'});
export const transientReadError = error => error?.name==='TimeoutError' ||
  error instanceof TypeError && !error.status || [408,502,503,504].includes(error?.status);

function pause(ms,signal){
 if(signal?.aborted)return Promise.reject(aborted());
 return new Promise((resolve,reject)=>{
  const finish=()=>{signal?.removeEventListener('abort',cancel);resolve()};
  const timer=setTimeout(finish,ms);
  const cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(aborted())};
  signal?.addEventListener('abort',cancel,{once:true});
 });
}

export async function readWithRecovery(request,{signal,timeoutMs=20000,retryDelayMs=300}={}){
 for(let attempt=0;attempt<2;attempt++){
  if(signal?.aborted)throw aborted();
  const controller=new AbortController();let timedOut=false;
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},timeoutMs);
  try{const result=await request(controller.signal);if(signal?.aborted)throw aborted();if(timedOut)throw timeout();return result}
  catch(error){
   if(signal?.aborted)throw aborted();
   const failure=timedOut?timeout():error;
   if(attempt||!transientReadError(failure))throw failure;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
  await pause(retryDelayMs,signal);
 }
}

export const recoverableInitialRead=error=>transientReadError(error)||error?.status===500;
// A failed config/session bootstrap cannot depend on an active session poll.
// Three delayed reads are enough for recovery without an unbounded retry loop.
export function initialReadRecovery({request,canRun,shouldRetry,delayMs=15000,maxAttempts=3,setTimer=setTimeout,clearTimer=clearTimeout}){
 let stopped=false,timer=null,attempts=0,running=false;
 const schedule=()=>{if(stopped||timer!==null||running||attempts>=maxAttempts||!shouldRetry())return;timer=setTimer(tick,delayMs)};
 const tick=async()=>{timer=null;if(stopped||running||attempts>=maxAttempts||!shouldRetry())return;attempts++;if(!canRun()){schedule();return}running=true;try{await request()}finally{running=false;schedule()}};
 return {schedule,wake(){if(stopped)return;attempts=0;if(timer!==null){clearTimer(timer);timer=null}return tick()},stop(){stopped=true;if(timer!==null)clearTimer(timer);timer=null}};
}
