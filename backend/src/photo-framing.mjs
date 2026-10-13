import {validatePhotoFrame,normalizePhotoFrame} from '../../src/photo-framing-model.js';
export function storedPhotoFrame(value){try{return normalizePhotoFrame(typeof value==='string'?JSON.parse(value):value)}catch{return normalizePhotoFrame()}}
// Old clients keep existing metadata for an unchanged photo. New photos start
// centered, unless their owner explicitly submits a valid frame.
export function photoFrameForSave({frame,photo,previousPhoto,previousFrame}){
 if(!photo)return validatePhotoFrame();
 try{return frame===undefined?photo===previousPhoto?storedPhotoFrame(previousFrame):validatePhotoFrame():validatePhotoFrame(frame)}catch(error){throw Object.assign(new Error(error.message),{status:400})}
}
