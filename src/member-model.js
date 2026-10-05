export function validBirthday(value,today=new Date()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
 const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
 return y>=1900&&date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d&&value<=localDate(today);
}
export function localDate(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
export function validateMember(member,{signup=false,child=false}={}){
 if(!member.name?.trim())return 'Enter a name.';
 if(!validBirthday(member.birthday))return 'Enter a valid birthday, today or earlier.';
 if(child&&!member.gender)return 'Choose a gender, including Prefer not to say if you like.';
 if(signup&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email||''))return 'Enter a valid email address.';
 return '';
}
export function birthdayEntries(members,date=new Date()){
 return members.filter(m=>validBirthday(m.birthday)&&Number(m.birthday.slice(5,7))===date.getMonth()+1).sort((a,b)=>a.birthday.slice(8).localeCompare(b.birthday.slice(8)));
}
