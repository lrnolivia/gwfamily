import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
export function database(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 class Statement{
  constructor(sql,args=[]){this.sql=sql;this.args=args}
  bind(...args){return new Statement(this.sql,args)}
  async all(){const stmt=sqlite.prepare(this.sql);const values=this.args.map(v=>v instanceof Date?v.getTime():typeof v==='boolean'?Number(v):v);if(stmt.columns().length){const results=stmt.all(...values);const meta=sqlite.prepare('SELECT changes() AS changes,last_insert_rowid() AS last_row_id').get();return {results,success:true,meta}}const m=stmt.run(...values);return {results:[],success:true,meta:{changes:Number(m.changes),last_row_id:Number(m.lastInsertRowid)}}}
  async first(column){const result=(await this.all()).results[0]||null;return column?result?.[column]??null:result}
  async run(){return this.all()}
  async raw(){return (await this.all()).results.map(Object.values)}
 }
 const DB={prepare:sql=>new Statement(sql),exec:async sql=>sqlite.exec(sql),async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.all());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 return {sqlite,DB};
}
export function seed(db){db.exec(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('owner','Owner','owner@example.test',1,0,0),('alice','Alice','alice@example.test',1,0,0),('bob','Bob','bob@example.test',1,0,0),('pending','Pending','pending@example.test',1,0,0);
 INSERT INTO members(id,status,roles_json,can_post,is_leader) VALUES('owner','active','["admin","moderator","planner","treasurer"]',1,1),('alice','active','[]',1,0),('bob','active','[]',1,0),('pending','pending','[]',0,0);
 INSERT INTO family_groups(id,name,created_by) VALUES('private-group','Private group','alice');INSERT INTO family_group_members(group_id,member_id,is_manager) VALUES('private-group','alice',1);
 INSERT INTO profiles(member_id,birthday,completed) VALUES('owner','1990-01-01',1),('alice','1991-02-03',1),('bob','1992-03-04',1);
 INSERT INTO products(id,name) VALUES('forest','Family shirt');`)}
