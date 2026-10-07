export const PAYMENT_PROVIDERS=[['cashApp','Cash App'],['paypal','PayPal'],['venmo','Venmo'],['zelle','Zelle'],['other','Other method']];
const text=(value,max)=>{if(value==null)return '';if(typeof value!=='string'||value.length>max)throw Error('Check the payment method text.');return value.trim()};
export function paymentMethods(payment={}){
 if(Array.isArray(payment.methods))return payment.methods;
 return [['paypal','PayPal'],['cashApp','Cash App']].flatMap(([provider,label])=>payment[provider]?[{provider,label,recipient:'',url:payment[provider],instructions:''}]:[]);
}
export function normalizePayment(payment={}){
 if(!payment||typeof payment!=='object'||Array.isArray(payment)||Object.hasOwn(payment,'methods')&&!Array.isArray(payment.methods))throw Error('Check the payment methods.');
 const amount=text(payment.amount,80),instructions=text(payment.instructions,1000),source=paymentMethods(payment);
 if(source.length>8)throw Error('Use up to eight payment methods.');
 const methods=source.map(m=>{
  const known=PAYMENT_PROVIDERS.find(([provider])=>provider===m.provider);if(!known)throw Error('Choose a supported payment method.');
  const label=m.provider==='other'?text(m.label,60):known[1],recipient=text(m.recipient,160),instructions=text(m.instructions,1000),raw=text(m.url,500);
  if(!label||!recipient&&!raw&&!instructions)throw Error('Add a recipient, payment link or instructions for each method.');
  let url='';if(raw){let u;try{u=new URL(raw)}catch{throw Error('Use a complete secure payment link.')}if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('Use a secure payment link without credentials.');
   const host=u.hostname.replace(/^www\./,''),allowed={paypal:['paypal.me'],cashApp:['cash.app'],venmo:['venmo.com','account.venmo.com']};
   if(allowed[m.provider]&&!allowed[m.provider].includes(host))throw Error('Use the official '+known[1]+' recipient link.');
   if(m.provider==='paypal'&&!/^\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)||m.provider==='cashApp'&&!/^\/\$[A-Za-z0-9_-]+\/?$/.test(u.pathname))throw Error('Use a recipient profile link.');
   if(u.search)throw Error('Remove extra payment-link parameters.');url=u.href;
  }
  return {provider:m.provider,label,recipient,url,instructions};
 });
 return {amount,instructions,methods,paypal:methods.find(m=>m.provider==='paypal')?.url||'',cashApp:methods.find(m=>m.provider==='cashApp')?.url||''};
}
