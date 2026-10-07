import {providerButtonState} from './official-sign-in-brand.mjs';

// Inject only the renderer so offline tests exercise the real component without
// installing packages, starting a browser, or invoking a bundler subprocess.
export function createOfficialSignInButton(React){
 const h=React.createElement;
 return function OfficialSignInButton({provider,onClick,disabled=false,busy=false}){
  const state=providerButtonState(provider,{disabled,busy});
  if(!state)return null;
  const blocked=state.disabled||typeof onClick!=='function';
  const image=(src,theme)=>h('img',{
   key:theme,className:`gw-provider-art gw-provider-art--${theme}`,src,
   width:state.width,height:state.height,alt:'',draggable:false,'aria-hidden':true,
  });
  return h('div',{className:'gw-provider-item','data-provider':provider},
   h('button',{
    type:'button',className:'gw-provider-button',disabled:blocked,
    'aria-label':state.label,'aria-busy':state.busy||undefined,
    onClick:event=>{if(!blocked)onClick(event);},
   },
   image(state.light,'light'),image(state.dark,'dark'),
   h('span',{className:'gw-provider-fallback'},state.label)),
   blocked&&h('span',{className:'gw-provider-status','aria-hidden':true},state.busy?'Opening sign-in…':'Please wait'),
  );
 };
}
