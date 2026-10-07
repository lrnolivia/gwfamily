// Every catalog page fits a six-column, four-row phone picker. Short visual
// viewports (including the on-screen keyboard) show fewer rows, never a scroller.
export function emojiPickerLayout(width=390,height=844){
 const columns=Math.max(1,Math.min(6,Math.floor((Math.min(300,width-24)-20+2)/46)));
 const rows=Math.max(1,Math.min(4,Math.floor((height-192)/46)));
 return {columns,rows,pageSize:columns*rows};
}
export function emojiPage(choices,query='',page=0,pageSize=24){
 const needle=query.trim().toLowerCase(),matches=choices.filter(emoji=>!needle||emoji.search.includes(needle)||emoji.native.includes(needle));
 const size=Math.max(1,Math.trunc(pageSize)||24),pages=Math.ceil(matches.length/size),current=Math.max(0,Math.min(Math.trunc(page)||0,Math.max(0,pages-1)));
 return {items:matches.slice(current*size,(current+1)*size),total:matches.length,page:current,pages};
}
