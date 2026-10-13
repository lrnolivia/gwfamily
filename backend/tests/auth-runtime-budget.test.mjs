import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {createAuth,authOptions} from '../src/auth.mjs';import {createApp} from '../src/worker.mjs';import {checkAuthSchema,compareAuthSchema,authSchemaFromPragma} from '../src/auth-schema.mjs';
import {serializeSigned as serializeSignedCookie} from 'hono/utils/cookie';
const secret='synthetic-auth-query-budget-secret-never-used-live';
async function fixture(account='alice'){
 const f=database();seed(f.sqlite);const statements=[];let fail=null;
 const wrap=statement=>({bind(...args){return wrap(statement.bind(...args))},async all(){statements.push(statement.sql);if(fail?.(statement.sql))throw Object.assign(new Error('D1_ERROR synthetic SQL private canary'),{code:'D1_ERROR'});return statement.all()},async first(column){const results=(await this.all()).results,row=results[0]||null;return column?row?.[column]??null:row},async run(){return this.all()},async raw(){return(await this.all()).results.map(Object.values)}});
 const DB={prepare:sql=>wrap(f.DB.prepare(sql)),exec:async sql=>{statements.push(sql);throw new Error("Schema checks must not execute writes")},async batch(items){return Promise.all(items.map(s=>s.all()))}};
 const now=Date.now();f.sqlite.prepare('INSERT INTO session(id,token,userId,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run('test-session','synthetic-token',account,now+7*86400000,now,now);
 const cookie=(await serializeSignedCookie('__Secure-better-auth.session_token','synthetic-token',secret,{secure:true})).split(';')[0];
 const env={DB,BETTER_AUTH_SECRET:secret,AUTH_ORIGIN:'https://family.example.test'};return {...f,DB,env,cookie,statements,setFailure:next=>fail=next,headers:new Headers({Cookie:cookie}),request:path=>createApp().request(env.AUTH_ORIGIN+path,{headers:{Cookie:cookie}},env)};
}
const schemaSql=sql=>/sqlite_master|pragma_table_info|pragma index_list/i.test(sql);
test('real per-request auth reads sessions without schema inspection, preserving all auth options',async()=>{
 const f=await fixture();const options=authOptions(f.env);assert.equal(options.advanced.database.validateSchema,false);assert.equal(options.advanced.useSecureCookies,true);assert.deepEqual(options.session,{expiresIn:604800,updateAge:86400,cookieCache:{enabled:false}});
 for(let i=0;i<3;i++){f.statements.length=0;const auth=createAuth(f.env),session=await auth.api.getSession({headers:f.headers});assert.equal(session.user.id,'alice');assert.equal(f.statements.filter(schemaSql).length,0);assert.equal(f.statements.length,2,JSON.stringify(f.statements));assert.ok(f.statements.some(sql=>/session/.test(sql)));assert.ok(f.statements.some(sql=>/user/.test(sql)))}
 f.sqlite.prepare('UPDATE session SET expiresAt=?,updatedAt=?').run(Date.now()+5*86400000,Date.now()-2*86400000);f.statements.length=0;assert.equal((await createAuth(f.env).api.getSession({headers:f.headers})).user.id,'alice');assert.equal(f.statements.length,3);assert.ok(f.statements.some(sql=>/^update \"session\"/i.test(sql)));assert.equal(f.statements.filter(schemaSql).length,0);
 f.statements.length=0;assert.equal(await createAuth(f.env).api.getSession({headers:new Headers()}),null);assert.equal(f.statements.length,0);
});
test('revoked sessions stay 401, pending members stay 403, and real session DB failures stay 500 with correlation',async()=>{
 const f=await fixture();assert.equal((await f.request('/api/me')).status,200);f.sqlite.exec('DELETE FROM session');assert.equal((await f.request('/api/me')).status,401);
 const pending=await fixture('pending');assert.equal((await pending.request('/api/me')).status,403);
 const broken=await fixture();broken.setFailure(sql=>/from "session"/i.test(sql));const logs=[],prior=console.error;console.error=(line)=>logs.push(line);try{const response=await broken.request('/api/me');assert.equal(response.status,500);const value=await response.json();assert.equal(response.headers.get('X-Request-ID'),value.requestId);assert.ok(logs.length>=2);const rows=logs.map(JSON.parse);assert.ok(rows.every(row=>row.requestId===value.requestId));assert.ok(rows.some(row=>row.category==='database'));assert.doesNotMatch(logs.join(' '),/synthetic-token|private canary|SELECT|Cookie/)}finally{console.error=prior}
});
test('messaging retains its second real authoritative session lookup',async()=>{
 const f=await fixture();const response=await f.request('/api/conversations/recipients');assert.equal(response.status,200,await response.text());assert.equal(f.statements.filter(schemaSql).length,0);assert.equal(f.statements.filter(sql=>/from "session"/i.test(sql)).length,2);
});
test('mandatory exact-config schema check is read-only and rejects all insert-incompatible drift',async()=>{
 for(const mutation of [null,'DROP TABLE account','ALTER TABLE user DROP COLUMN name','ALTER TABLE account ADD COLUMN incompatible TEXT NOT NULL']){
  const f=await fixture();if(mutation)f.sqlite.exec(mutation);f.statements.length=0;if(mutation)await assert.rejects(checkAuthSchema(f.env),e=>e.code==='SCHEMA_MISMATCH');else await checkAuthSchema(f.env);
  assert.ok(f.statements.length>0);assert.ok(f.statements.every(sql=>/^select|^pragma/i.test(sql.trim())));
 }
 const f=await fixture(),rows=['user','session','account','verification'].flatMap(table=>f.sqlite.prepare('SELECT ? table_name,name,type,"notnull" required,dflt_value,pk FROM pragma_table_info(?)').all(table,table)),tables=authSchemaFromPragma(rows);
 assert.equal(compareAuthSchema(f.env,tables).findings,0);const bad=structuredClone(tables);bad.find(t=>t.name==='account').columns.push({name:'required_extra',nullable:false,hasDefault:false});assert.throws(()=>compareAuthSchema(f.env,bad),e=>e.code==='SCHEMA_MISMATCH');
});
test('simultaneous real auth instances keep separate database and account bindings',async()=>{
 const a=await fixture('alice'),b=await fixture('bob');const sessions=await Promise.all(Array.from({length:12},(_,i)=>{const f=i%2?a:b;return createAuth(f.env).api.getSession({headers:f.headers})}));assert.deepEqual(sessions.map(s=>s.user.id),Array.from({length:12},(_,i)=>i%2?'alice':'bob'));assert.ok([...a.statements,...b.statements].every(sql=>!schemaSql(sql)));
});
