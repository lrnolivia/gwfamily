// Shared device controller. Readiness, key and registration are preloaded before Enable.
export function deviceCapability({window,navigator,Notification}){
 const ua=navigator?.userAgent||'',ios=/iPad|iPhone|iPod/.test(ua)||(navigator?.platform==='MacIntel'&&navigator?.maxTouchPoints>1);
 const installed=!!(window?.matchMedia?.('(display-mode: standalone)')?.matches||navigator?.standalone===true);
 if(!window?.isSecureContext)return {available:false,reason:'secure-context-required'};
 const embedded=/FBAN|FBAV|Instagram|\bwv\b|Line\/|MicroMessenger/i.test(ua);
 if(embedded||(window.top&&window.self&&window.top!==window.self))return {available:false,reason:'open-full-browser'};
 if(ios&&!installed)return {available:false,reason:'install-ios-first'};
 // An OS/browser name is never sufficient: inspect every API we need.
 if(!navigator?.serviceWorker||typeof window?.PushManager?.prototype?.subscribe!=='function'||typeof window?.PushManager?.prototype?.getSubscription!=='function'||typeof window?.ServiceWorkerRegistration?.prototype?.showNotification!=='function'||typeof Notification?.requestPermission!=='function')return {available:false,reason:'unsupported'};
 if(Notification.permission==='denied')return {available:false,reason:'permission-denied'};
 return {available:true,reason:Notification.permission==='granted'?'permission-granted-not-yet-registered':'permission-needed'};
}
export function applicationServerKeyBytes(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{87}$/.test(value))throw new Error('Device push configuration is invalid');
 const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
 if(raw.length!==65||raw.charCodeAt(0)!==4)throw new Error('Device push configuration is invalid');
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export function createDevicePushController({Notification,registration,save,revoke,currentAccountId}){
 let epoch=0,busy=false,device=null;
 return {
  // UI MUST call directly from an explicit Enable click, after explanation.
  async enable(config,expectedAccountId){
   if(busy)throw new Error('Device setup is already in progress');
   if(config?.ready!==true||!config.publicKey||!config.keyVersion)throw new Error('Device push is not activated');
   if(currentAccountId()!==expectedAccountId)throw new Error('Account changed');
   const keyBytes=applicationServerKeyBytes(config.publicKey);
   const operation=epoch;busy=true;let subscription;
   try{
    // Do not insert awaited config/registration work before this gesture call.
    const permission=await Notification.requestPermission();if(permission!=='granted')return {enabled:false,reason:permission};
    if(operation!==epoch||currentAccountId()!==expectedAccountId)throw new Error('Account changed');
    subscription=await registration.pushManager.getSubscription();
    if(subscription)await subscription.unsubscribe(); // Fresh ownership on explicit opt-in.
    subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes});
    if(operation!==epoch||currentAccountId()!==expectedAccountId)throw new Error('Account changed');
    const result=await save({subscription:subscription.toJSON(),expectedAccountId,keyVersion:config.keyVersion});
    if(operation!==epoch||currentAccountId()!==expectedAccountId){await revoke({id:result.id,expectedAccountId});throw new Error('Account changed')}
    device={id:result.id,accountId:expectedAccountId};return {enabled:true};
   }catch(error){if(subscription)await subscription.unsubscribe().catch(()=>{});throw error}finally{busy=false}
  },
  async disable(){epoch++;const owned=device;try{if(owned)await revoke({id:owned.id,expectedAccountId:owned.accountId});device=null}finally{const sub=await registration.pushManager.getSubscription();if(sub)await sub.unsubscribe()}return {enabled:false}},
  // Invoke before sign-out/account switch and complete server revoke while old
  // session exists. Server session-deletion hook is the independent backstop.
  invalidate(){epoch++;device=null}
 };
}
