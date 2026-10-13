export const DEVICE_ACCOUNT_KEY='gw-device-account:v1';
export const DEVICE_PROVIDER_KEY='gw-device-provider:v1';
const providers=new Set(['google','microsoft','yahoo','email']);
// This display hint is local to the device. It never establishes identity,
// authorizes a request, or persists an email, account ID, token or permission.
export function cleanDeviceAccount(value){
 if(!value||value.version!==1||typeof value.name!=='string'||!value.name.trim())return null;
 const name=value.name.trim().slice(0,80),provider=providers.has(value.provider)?value.provider:null;
 const avatar=typeof value.avatar==='string'&&value.avatar.length<=60000&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value.avatar)?value.avatar:null;
 return {version:1,name,avatar,provider};
}
export function readDeviceAccount(storage=globalThis.localStorage){try{return cleanDeviceAccount(JSON.parse(storage.getItem(DEVICE_ACCOUNT_KEY)))}catch{return null}}
export function rememberDeviceAccount(value,storage=globalThis.localStorage){const account=cleanDeviceAccount({...value,version:1});if(!account)return false;try{storage.setItem(DEVICE_ACCOUNT_KEY,JSON.stringify(account));return true}catch{return false}}
export function rememberDeviceProvider(provider,storage=globalThis.sessionStorage){if(!providers.has(provider))return false;try{storage.setItem(DEVICE_PROVIDER_KEY,provider);return true}catch{return false}}
export function lastDeviceProvider(storage=globalThis.sessionStorage){try{const provider=storage.getItem(DEVICE_PROVIDER_KEY);return providers.has(provider)?provider:null}catch{return null}}
