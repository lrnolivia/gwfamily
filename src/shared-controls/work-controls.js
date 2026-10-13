export const controlBarVersion='1.1.0';
/** Approved CTRL controls, reconstructed from the October 6 visual reference.
 * Review dispositions remain protocol values: "completed" means reviewed,
 * never source-task completion. This module renders controls and does no I/O.
 */
export const workControlLabels = Object.freeze({pending:'needs me',completed:'reviewed',stale:'outdated',archived:'archived',all:'everything'});
export const workControlDefaults = Object.freeze({filter:'pending',search:'',sort:'time',direction:'desc'});
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shapes = {
 check:'<path d="m5 12 5 5L20 7"/>',
 filter:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
 list:'<path d="M8 5h13M8 12h13M8 19h13"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/>',
 projects:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
 flag:'<path d="M6 21V3m0 1c5-3 7 3 13 0v10c-6 3-8-3-13 0"/>',
 refresh:'<path d="M20 7v5h-5"/><path d="M20 12a8 8 0 1 1-2-5"/>',
 archive:'<path d="M4 8v13h16V8M2 3h20v5H2zM9 12h6"/>',
 next:'<path d="m9 5 7 7-7 7"/>'
};
export function workControlGlyph(name) { return '<svg class="work-control-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(shapes[name]||shapes.check)+'</svg>'; }
export function normalizeWorkControlQuery(input={}) {
 return {...input,filter:Object.hasOwn(workControlLabels,input.filter)?input.filter:'pending',search:typeof input.search==='string'?input.search:'',sort:input.sort==='importance'?'importance':'time',direction:input.direction==='asc'?'asc':'desc',extensions:input.extensions&&typeof input.extensions==='object'&&!Array.isArray(input.extensions)?{...input.extensions}:{}};
}
export function applyWorkControlChoice(query, key, value) {
 const allowed={filter:Object.keys(workControlLabels),sort:['time','importance'],direction:['desc','asc']};
 if(!Object.hasOwn(allowed,key)||!allowed[key].includes(value))return query;
 return {...query,[key]:value};
}
const number = value => Number.isSafeInteger(value)&&value>=0?value:0;
/** Source-backed outer shell. Content slots accept only host-rendered trusted markup.
 * Every human/string value is escaped. No data reads or mutations occur here.
 */
export const controlBarVariants = Object.freeze({
 work:Object.freeze({searchLabel:'search work',placeholder:'find work',viewOptions:[{value:'list',label:'List view',icon:'list'},{value:'visual',label:'Visual view',icon:'projects'}]}),
 media:Object.freeze({searchLabel:'search media',placeholder:'find photos and videos',viewOptions:[{value:'grid',label:'Gallery view',icon:'projects'},{value:'list',label:'Media list',icon:'list'}]}),
 files:Object.freeze({searchLabel:'search files',placeholder:'find files',viewOptions:[{value:'list',label:'File list',icon:'list'},{value:'grid',label:'File grid',icon:'projects'}]})
});
export function renderControlShell({variant='work',search='',placeholder,searchLabel,view='list',viewOptions,filterTitle='filter & sort',organizeTitle='organize',filterContent='',organizeContent='',openMenus=[],hideOrganize=false,glyph=workControlGlyph}={}) {
 const defaults=controlBarVariants[variant]||controlBarVariants.work, options=viewOptions||defaults.viewOptions, menus=new Set(openMenus);
 return `<div class="work-control-summary"><label class="work-search-compact"><span class="sr-only">${escape(searchLabel??defaults.searchLabel)}</span><input data-focus="search" name="search" type="search" value="${escape(search)}" placeholder="${escape(placeholder??defaults.placeholder)}"></label><div class="work-view-switch" role="group" aria-label="${escape(variant==='work'?'work presentation':variant+' presentation')}">${options.map(option=>`<button type="button" data-view="${escape(option.value)}" data-focus="view-${escape(option.value)}" aria-pressed="${view===option.value}" aria-label="${escape(option.label)}" title="${escape(option.label)}">${glyph(option.icon)}</button>`).join('')}</div></div><div class="work-control-pair"><details class="work-control-menu" data-control-menu="filters" ${menus.has('filters')?'open':''}><summary data-focus="menu-filters">${glyph('filter')}<span>${escape(filterTitle)}</span>${glyph('next')}</summary><div class="work-control-panel">${filterContent}</div></details>${hideOrganize?'':`<details class="work-control-menu" data-control-menu="organize" ${menus.has('organize')?'open':''}><summary data-focus="menu-organize">${glyph('check')}<span>${escape(organizeTitle)}</span>${glyph('next')}</summary><div class="work-control-panel">${organizeContent}</div></details>`}</div>`;
}
export function renderControlFooter({menu='filters',hint='your list updates as you choose',doneLabel='done',glyph=workControlGlyph}={}) {
 return `<footer class="work-controls-footer"><p>${escape(hint)}</p><button type="button" class="work-controls-done" data-close-menu="${escape(menu)}">${escape(doneLabel)} ${glyph('check')}</button></footer>`;
}
export function renderControlChoiceGroup({key,label,value,options,glyph=workControlGlyph}={}) {
 return `<div class="work-control-field"><p class="work-control-label">${escape(label)}</p><div class="work-control-choices" role="radiogroup" aria-label="${escape(label)}">${options.map(option=>`<button type="button" class="work-choice" data-query="${escape(key)}" data-value="${escape(option.value)}" data-focus="${escape(key)}-${escape(option.value)}" role="radio" aria-checked="${value===option.value}" tabindex="${value===option.value?'0':'-1'}">${option.icon?glyph(option.icon):''}<span>${escape(option.label)}</span></button>`).join('')}</div></div>`;
}
export function renderWorkControls({query:raw={},view='list',openMenus=[],selected=0,visible=0,hidden=0,allVisibleSelected=false,busy=false,loaded=false,scope='selected',extensionControls=[],canAct=()=>false,glyph=workControlGlyph,outerGlyph=workControlGlyph}={}) {
 const query=normalizeWorkControlQuery(raw),menus=new Set(openMenus),count=number(selected),shown=number(visible),outside=number(hidden);
 const choice=(key,value,label,icon)=>`<button type="button" class="work-choice" data-query="${key}" data-value="${value}" data-focus="${key}-${value}" role="radio" aria-checked="${query[key]===value}" tabindex="${query[key]===value?'0':'-1'}">${icon?glyph(icon):''}<span>${escape(label)}</span></button>`;
 const action=(value,label,icon,primary=false)=>`<button type="button" class="work-review-action${primary?' work-review-primary':''}" data-bulk="${value}" ${busy||!loaded||!canAct(value)?'disabled':''}>${glyph(icon)}<span>${label}</span></button>`;
 const done=name=>renderControlFooter({menu:name,hint:name==='filters'?'your list updates as you choose':'nothing changes until you confirm',glyph});
 const filterContent=`<div class="work-control-field"><p class="work-control-label">show me</p><div class="work-filter-bar" role="group" aria-label="review status">${Object.entries(workControlLabels).map(([value,label])=>`<button type="button" data-filter="${value}" data-focus="filter-${value}" aria-pressed="${query.filter===value}"><span>${label}</span>${query.filter===value?glyph('check'):''}</button>`).join('')}</div></div>
 <div class="work-query-bar"><div class="work-control-field"><p class="work-control-label">arrange by</p><div class="work-control-choices" role="radiogroup" aria-label="arrange by">${choice('sort','time','recent updates','clock')}${choice('sort','importance','importance','flag')}</div></div>
 <div class="work-control-field"><p class="work-control-label">put first</p><div class="work-control-choices" role="radiogroup" aria-label="put first">${choice('direction','desc',query.sort==='time'?'newest first':'highest first')}${choice('direction','asc',query.sort==='time'?'oldest first':'lowest first')}</div></div></div>
 ${extensionControls.map(control=>`<label class="work-control-extension">${escape(control.label)}<select name="extension:${escape(control.key)}" data-focus="extension:${escape(control.key)}"><option value="">all</option>${control.options.map(option=>`<option value="${escape(option.value)}" ${query.extensions[control.key]===option.value?'selected':''}>${escape(option.label)}</option>`).join('')}</select></label>`).join('')}
 ${done('filters')}`;
 const organizeContent=`<div class="work-selection-heading"><h3><strong>${count}</strong> selected</h3><button type="button" class="work-clear-selection" data-clear-selection ${!count||busy?'disabled':''}>clear</button></div><p class="work-selection-hint">choose what happens next</p>
 ${outside?`<p class="work-selection-hidden">${outside} selected ${outside===1?'item is':'items are'} outside these results</p>`:''}
 <label class="work-select-visible"><input type="checkbox" data-select-visible data-focus="select-visible" ${shown&&allVisibleSelected?'checked':''} ${busy||!loaded||!shown?'disabled':''}><span>choose all ${shown} shown here</span></label>
 <div class="work-control-field"><p class="work-control-label">your next step</p><div class="work-bulk-bar">${action('completed','mark reviewed','check',true)}${action('pending','review again','refresh')}${action('stale','mark outdated','clock')}</div></div>
 <details class="work-put-away" data-control-menu="archive" ${menus.has('archive')?'open':''}><summary data-focus="menu-archive">${glyph('archive')}<span>put away or bring back</span>${glyph('next')}</summary><div class="work-archive-actions">${action('clear-complete','put reviewed away','archive')}${action('clear-stale','put outdated away','archive')}${action('restore','bring back','refresh')}<label>change these items<select name="scope" data-focus="scope"><option value="selected" ${scope==='selected'?'selected':''}>selected items</option><option value="filtered" ${scope==='filtered'?'selected':''}>current filtered results</option><option value="all-projects" ${scope==='all-projects'?'selected':''}>all projects · matching loaded results</option></select></label></div></details>
 ${scope!=='selected'?'<p class="work-selection-hidden">Action scope: '+(scope==='filtered'?'current filtered results':'all projects, matching loaded results')+'. You will confirm the exact items before saving.</p>':''}
 ${done('organize')}`;
 return renderControlShell({search:query.search,view,openMenus,organizeTitle:count?count+' selected':'organize',filterContent,organizeContent,hideOrganize:!shown,glyph:outerGlyph});
}
