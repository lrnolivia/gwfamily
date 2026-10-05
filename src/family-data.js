// Explicit owner-supplied names. All account activity below is fictional preview content.
// Memorial entries are deliberately outside members and cannot author activity.
const living=[
  ['lauren','Lauren Olivia White',null],['monique','Monique Rivers','rivers'],['sheldon','Sheldon Caldwell',null],
  ['doris','Doris Hall','hall'],['sonny','Sonny Hall','hall'],['grendy','Grendy Henry','henry'],['bryan','Bryan Henry','henry'],
  ['barbara','Barbara Jean Bates','bates'],['thaddeus','Thaddeus Bates','bates'],['tameka','Tameka Bates','bates'],
  ['otis','Otis Tucker','tucker'],['kenyatta','Kenyatta Tucker','tucker'],['annette','Annette Eummer','eummer'],['kim','Kim Eummer','eummer'],
  ['antar','Antar Rivers','rivers'],['khloe','Khloe Rivers','rivers'],['keenan','Keenan Rivers','rivers'],['aaron','Aaron Rivers','rivers'],['willie','Willie Lomack','lomack']
];
export const memorials=[
  {id:'lloyd',name:'Lloyd White',founder:true}, {id:'annie',name:'Annie White',maidenName:'Green',founder:true},
  {id:'shirley',name:'Shirley Thomas'}, {id:'everett',name:'Everett Bates'}, {id:'bonnie',name:'Bonnie Tucker'}, {id:'ruthie',name:'Ruthie Lomack'}
];
// Only relationships explicitly supplied by the owner. Groups are not genealogy edges.
export const relationships=[
  {type:'parent',from:'shirley',to:'lauren'},{type:'parent',from:'shirley',to:'monique'},{type:'parent',from:'shirley',to:'sheldon'},
  ...['khloe','keenan'].flatMap(to=>['monique','antar'].map(from=>({type:'parent',from,to}))),
  {type:'parent',from:'antar',to:'aaron'},{type:'stepparent',from:'monique',to:'aaron'},
  {type:'parent',from:'otis',to:'kenyatta'}, {type:'siblings',from:'grendy',to:'bryan'},{type:'siblings',from:'thaddeus',to:'tameka'}
];
export function previewSeed(){
  const now=Date.now();
  return {
    members:living.map(([id,name,groupId])=>({id,name,groupId,circle:'family',leader:false,moderator:id==='lauren',bio:'A place for family stories.',photo:null,birthday:null,adult:true,origin:'seed',registered:false,socials:{},profileColor:'#4f996c',themeSong:''})),
    memorials:structuredClone(memorials),relationships:structuredClone(relationships),
    groups:['rivers','hall','henry','bates','tucker','eummer','lomack'].map(id=>({id,name:id[0].toUpperCase()+id.slice(1),memberIds:living.filter(m=>m[2]===id).map(m=>m[0]),nameEdited:false})),
    posts:[
      {id:'post-generations',authorId:'monique',text:'A place for our favorite moments and the next gathering.',image:'photos/generations.jpg',sampleMedia:true,createdAt:now-86400000},
      {id:'post-poll',authorId:'sheldon',text:'What’s on the reunion playlist?',poll:{mode:'single',options:['The classics','A little bit of everything','Let the cousins DJ'],votes:{0:2,1:3,2:1}},createdAt:now-172800000}
    ],
    memories:[
      {id:'memory-generations',authorId:'monique',title:'Together',image:'photos/generations.jpg',sampleMedia:true,category:'Family moments',tags:['Preview'],memberIds:[],event:'',year:'2025',milestone:''},
      {id:'memory-garden',authorId:'lauren',title:'An afternoon together',image:'photos/garden.jpg',sampleMedia:true,category:'Gatherings',tags:['Preview'],memberIds:[],event:'Reunion',year:'2024',milestone:''}
    ],
    comments:{'post-generations':[
      {id:'seed-comment-1',authorId:'aaron',text:'Saving a seat for everyone!',createdAt:now-3600000,parentId:null,files:[]},
      {id:'seed-comment-2',authorId:'khloe',text:'Looking forward to it.',createdAt:now-1800000,parentId:'seed-comment-1',files:[]}
    ]},reactions:{'post-generations':['❤️'],'seed-comment-1':['🎉']}
  };
}
