import {providerButtonState,GOOGLE_SIGN_IN_LOGO} from './official-sign-in-brand.mjs';

// Inject only the renderer so offline tests exercise the real component without
// installing packages, starting a browser, or invoking a bundler subprocess.
export function createOfficialSignInButton(React){
 const h=React.createElement;
 return function OfficialSignInButton({provider,onClick,disabled=false,busy=false,intent='signin'}){
  const state=providerButtonState(provider,{disabled,busy});
  if(!state)return null;
  const label=intent==='signup'?state.label.replace('Sign in','Sign up'):state.label;
  const blocked=state.disabled||typeof onClick!=='function';
  // Preserve the original Microsoft symbol geometry and Yahoo mark viewport.
  const logo=provider==='microsoft'?h('svg',{viewBox:'13 11 19 19',width:24,height:24,'aria-hidden':true},
   ...[[13,11,'#f25022'],[13,21,'#00a4ef'],[23,11,'#7fba00'],[23,21,'#ffb900']].map(([x,y,fill])=>h('rect',{key:fill,x,y,width:9,height:9,fill})))
   :h('img',{src:provider==='google'?GOOGLE_SIGN_IN_LOGO.src:state.dark,width:provider==='google'?200:state.width,height:provider==='google'?204:state.height,alt:'',draggable:false,'aria-hidden':true});
  return h('div',{className:'gw-provider-item','data-provider':provider},
   h('button',{
    type:'button',className:'gw-provider-button',disabled:blocked,
    'aria-label':label,'aria-busy':state.busy||undefined,
    onClick:event=>{if(!blocked)onClick(event);},
   },
   h('span',{className:`gw-provider-mark gw-provider-mark--${provider}`,'aria-hidden':true},logo),
   h('span',{className:'gw-provider-label'},label)),
   blocked&&h('span',{className:'gw-provider-status','aria-hidden':true},state.busy?'Opening sign-in…':'Please wait'),
  );
 };
}
