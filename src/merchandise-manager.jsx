import React,{useEffect,useRef,useState} from 'react';
import {ChoiceControl} from './choice-control.jsx';
import {ImageUploadControl} from './image-upload-control.jsx';
import {PersonIdentity} from './person-identity.jsx';
import {ViewSwitcher} from './view-switcher.jsx';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
import {readPreviewFile} from './uploads.js';
import {claimDate,claimLines,imageFileError} from './form-consumer-model.js';
import './form-layout.css';
import './form-consumers.css';
const empty=()=>({name:'',description:'',price:'',photo:null,options:[],active:true});
const fulfillment=[['claimed','New order'],['ordered','Ordered from supplier'],['ready','Ready for pickup'],['shipped','Shipped'],['delivered','Delivered / picked up']].map(([value,label])=>({value,label}));

export function MerchandiseManager({items,onRefresh}){
 const {state,dispatch,setToast}=useApp(),[editing,setEditing]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[photoBusy,setPhotoBusy]=useState(false),[photoError,setPhotoError]=useState(''),[refreshError,setRefreshError]=useState(''),[refreshing,setRefreshing]=useState(false),[orderBusy,setOrderBusy]=useState(''),[orderErrors,setOrderErrors]=useState({}),[filter,setFilter]=useState('open');
 const saving=useRef(false),uploading=useRef(false),orderLock=useRef(false),generation=useRef(0),accountGeneration=useRef(0),mounted=useRef(true);
 const products=state.mode==='preview'?(state.products||[]):items?.products||[],orders=items?.claims||[];
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;accountGeneration.current++}},[]);
 useEffect(()=>{generation.current++;accountGeneration.current++;setEditing(null);setError('');setPhotoError('');setPhotoBusy(false);uploading.current=false;setOrderErrors({});setRefreshError('')},[state.selfId,state.mode]);
 const set=(key,value)=>setEditing(previous=>previous?({...previous,[key]:value}):previous);
 function start(product){if(saving.current||uploading.current)return;generation.current++;setError('');setPhotoError('');setEditing(product?{...empty(),...product,options:(product.options||[]).map(group=>({...group,values:[...group.values]}))}:empty())}
 function cancel(){if(saving.current||uploading.current)return;generation.current++;setEditing(null);setError('');setPhotoError('')}
 async function refresh(){const account=accountGeneration.current;setRefreshError('');setRefreshing(true);try{await onRefresh()}catch(e){if(mounted.current&&account===accountGeneration.current)setRefreshError(e.message||'The latest catalog and orders couldn’t be loaded. Try again.')}finally{if(mounted.current&&account===accountGeneration.current)setRefreshing(false)}}
 async function photo(file){
  if(uploading.current||saving.current)return;uploading.current=true;const version=generation.current;setPhotoBusy(true);setPhotoError('');
  try{const validation=imageFileError(file,'item photo');if(validation)throw Error(validation);const upload=await readPreviewFile(file,state.mode);if(mounted.current&&version===generation.current)set('photo',upload.url)}catch(e){if(mounted.current&&version===generation.current)setPhotoError(e.message||'The photo couldn’t be added. Choose it again to retry.')}finally{if(version===generation.current){uploading.current=false;if(mounted.current)setPhotoBusy(false)}}
 }
 async function save(event){
  event.preventDefault();if(saving.current||uploading.current||!editing)return;if(!editing.name.trim()){setError('Enter an item name.');return}saving.current=true;const version=generation.current;setError('');setBusy(true);
  try{if(await dispatch({type:'SAVE_PRODUCT',product:editing})){if(mounted.current&&version===generation.current){setEditing(null);setToast('Item saved.');await refresh()}}else if(mounted.current&&version===generation.current)setError('The item wasn’t saved. Try again.')}catch(e){if(mounted.current&&version===generation.current)setError(e.message||'The item wasn’t saved. Try again.')}finally{saving.current=false;if(mounted.current)setBusy(false)}
 }
 async function updateOrder(order,status){
  if(orderLock.current)return;orderLock.current=true;const account=accountGeneration.current;setOrderBusy(order.id);setOrderErrors(previous=>({...previous,[order.id]:''}));
  try{if(await dispatch({type:'UPDATE_CLAIM',id:order.id,status})){if(mounted.current&&account===accountGeneration.current)await refresh()}else if(mounted.current&&account===accountGeneration.current)setOrderErrors(previous=>({...previous,[order.id]:'The fulfillment status wasn’t saved. Choose it again to retry.'}))}catch(e){if(mounted.current&&account===accountGeneration.current)setOrderErrors(previous=>({...previous,[order.id]:e.message||'The fulfillment status wasn’t saved. Choose it again to retry.'}))}finally{orderLock.current=false;if(mounted.current&&account===accountGeneration.current)setOrderBusy('')}
 }
 const visibleOrders=orders.filter(order=>filter==='all'||order.status!=='delivered');
 return <div className="stack merchandise-manager">
  <div className="section-head"><div><h2>Merchandise</h2><p className="muted">Family items, options, and fulfillment.</p></div>{!editing&&<Button disabled={busy||photoBusy} onClick={()=>start()}><Glyph name="plus"/>Add item</Button>}</div>
  {refreshError&&<div className="merchandise-refresh-error"><p role="alert">{refreshError}</p><Button secondary disabled={refreshing} onClick={refresh}>{refreshing?'Refreshing…':'Try refresh again'}</Button></div>}
  {editing?<form className="card gw-form form-density-scope merchandise-item-form" onSubmit={save} aria-busy={busy||photoBusy}>
   <h3>{editing.id?'Edit item':'New item'}</h3>
   <div className="form-image-intro">
    <div className="form-image-control"><ImageUploadControl label="Item photo" src={editing.photo||''} alt={editing.name?editing.name+' item photo':'Current item photo'} shape="profile" accept="image/png,image/jpeg,image/webp,image/gif" busy={photoBusy} disabled={busy} error={photoError} onFiles={files=>photo(files[0])}/>{editing.photo&&<Control type="button" className="text-button" disabled={busy||photoBusy} onClick={()=>{set('photo',null);setPhotoError('')}}>Remove photo</Control>}</div>
    <div className="form-image-fields">
     <label>Name<input required maxLength="100" disabled={busy} value={editing.name} onChange={event=>set('name',event.target.value)}/></label>
     <label>Price or contribution note<input type="text" maxLength="60" disabled={busy} value={editing.price} onChange={event=>set('price',event.target.value)} placeholder="$15 · pay at pickup"/></label>
     <p className="field-help">Orders record selections. Payments are arranged separately.</p>
    </div>
   </div>
   <label>Description<textarea maxLength="1000" rows="3" disabled={busy} value={editing.description} onChange={event=>set('description',event.target.value)}/></label>
   <fieldset className="form-section" disabled={busy}><legend>Options</legend><p className="field-help">Optional groups such as Size, Style, or Color. Separate choices with commas.</p>{editing.options.map((group,index)=><div className="merch-option-group" key={index}>
    <label>Option name<input required maxLength="40" value={group.name} onChange={event=>set('options',editing.options.map((value,position)=>position===index?{...value,name:event.target.value}:value))}/></label>
    <label>Choices<input required type="text" value={group.values.join(',')} onChange={event=>set('options',editing.options.map((value,position)=>position===index?{...value,values:event.target.value.split(',')}:value))}/></label>
    <Button secondary aria-label={'Remove option group '+(group.name||index+1)} onClick={()=>set('options',editing.options.filter((_,position)=>index!==position))}>Remove option</Button>
   </div>)}{editing.options.length<3&&<Button secondary onClick={()=>set('options',[...editing.options,{name:'',values:[]}])}>Add option group</Button>}</fieldset>
   <label className="check-row"><input type="checkbox" disabled={busy} checked={editing.active!==false} onChange={event=>set('active',event.target.checked)}/>Available to order</label>
   {error&&<p role="alert">{error}</p>}
   <div className="row"><Control type="submit" className="button" disabled={busy||photoBusy}>{busy?'Saving…':'Save item'}</Control><Button secondary disabled={busy||photoBusy} onClick={cancel}>Cancel</Button></div>
  </form>:<div className="merch-catalog">{products.map(product=><article key={product.id} className="card"><div className="merch-product-art">{product.photo?<img src={product.photo} alt={product.name}/>:<Glyph name="shirt"/>}</div><h3>{product.name}</h3><p>{product.price||'Price not set'}</p><p className="muted small">{product.active===false?'Unavailable':(product.options||[]).map(group=>group.name).join(' · ')||'Standard item'}</p><Button secondary disabled={busy} onClick={()=>start(product)}>Edit item</Button></article>)}{!products.length&&<p className="muted">Add your first item, such as a shirt, cap, or tote.</p>}</div>}
  <section className="stack"><div className="section-head"><h2>Orders</h2><ViewSwitcher label="Order filter" value={filter} onChange={setFilter} options={[["open","To fulfill","shirt"],["all","All orders","people"]]}/></div>
   {visibleOrders.map(order=>{const details=claimLines(order),date=claimDate(order.created_at);return <article className="card gw-form merchandise-order" key={order.id} aria-busy={orderBusy===order.id}>
    <PersonIdentity memberId={order.member_id} displayName={order.name} fallbackName="Family member"/>
    <p className="small muted">Order {String(order.id).slice(0,8)}{date?' · '+date:''}</p>
    {details.error?<div><p role="alert">{details.error}</p><Button secondary disabled={refreshing} onClick={refresh}>{refreshing?'Refreshing…':'Refresh orders'}</Button></div>:<ul>{details.lines.map((line,index)=><li key={index}><strong>{line.name||products.find(product=>product.id===line.productId)?.name||'Item'}</strong> · {line.size} × {line.quantity}{line.price?' · '+line.price:''}</li>)}</ul>}
    <ChoiceControl required variant="search" label="Fulfillment" aria-label={'Fulfillment for order '+String(order.id).slice(0,8)} value={order.status} disabled={!!orderBusy||!!details.error} error={orderErrors[order.id]||''} onChange={status=>updateOrder(order,status)} options={fulfillment}/>
   </article>})}
   {!visibleOrders.length&&<p className="muted">{filter==='open'?'No orders waiting for fulfillment.':'No orders yet.'}</p>}
  </section>
 </div>;
}
