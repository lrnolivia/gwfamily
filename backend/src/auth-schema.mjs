import {getExpectedSchema,diffSchema} from '@better-auth/core/db/internal';
import {authOptions,createAuth} from './auth.mjs';

// The same options and pinned library as createAuth. Nothing here repairs schema.
export function compareAuthSchema(env,tables){
 if(!Array.isArray(tables))throw new Error('Auth schema metadata is required');
 const expected=getExpectedSchema(authOptions(env)),findings=diffSchema(expected,tables);
 if(findings.length){const error=new Error('Auth schema is incompatible');error.code='SCHEMA_MISMATCH';error.findings=findings;throw error}
 return {tables:Object.keys(expected).sort(),findings:0};
}
export async function checkAuthSchema(env){
 const context=await createAuth(env,{stage:'auth.schema'}).$context;
 if(typeof context.explicitSchemaCheck!=='function')throw new Error('Pinned auth schema check is unavailable');
 await context.explicitSchemaCheck();return {checked:true};
}
export function authSchemaFromPragma(rows){
 if(!Array.isArray(rows)||rows.some(row=>!['user','session','account','verification'].includes(row.table_name)||typeof row.name!=='string'))throw new Error('Invalid read-only auth metadata');
 const tables=new Map();for(const row of rows){if(!tables.has(row.table_name))tables.set(row.table_name,{name:row.table_name,columns:[]});tables.get(row.table_name).columns.push({name:row.name,nullable:row.required!==1,hasDefault:row.dflt_value!==null&&row.dflt_value!==undefined,dataType:row.type})}return [...tables.values()];
}
