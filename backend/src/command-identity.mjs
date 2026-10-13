// Canonical object keys make semantically identical JSON retries stable. Arrays
// remain ordered because their order can be meaningful for domain mutations.
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));return value}
export async function commandFingerprint(input){const {requestId,...payload}=input;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(payload)))))].map(v=>v.toString(16).padStart(2,'0')).join('')}
