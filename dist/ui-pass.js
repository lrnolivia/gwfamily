// Local presentation adapter. Session data remains owned by app/conversation.js.
(() => {
  const root = document.documentElement;
  const sheet = document.getElementById('sheet');
  const margin = 12;
  let reaction = null;
  let invoker = null;

  function viewport() {
    const v = window.visualViewport;
    return {left:v?.offsetLeft || 0, top:v?.offsetTop || 0,
      width:v?.width || window.innerWidth, height:v?.height || window.innerHeight};
  }
  function setViewport() {
    const v = viewport();
    root.style.setProperty('--vv-left', v.left+'px');
    root.style.setProperty('--vv-top', v.top+'px');
    root.style.setProperty('--vv-width', v.width+'px');
    root.style.setProperty('--vv-height', v.height+'px');
    for (const panel of document.querySelectorAll('[popover]:popover-open')) {
      if (panel.dataset.anchorX) place(panel, {left:+panel.dataset.anchorX, top:+panel.dataset.anchorY,
        bottom:+panel.dataset.anchorBottom, width:0, height:0});
    }
  }
  function place(panel, anchor) {
    const v = viewport();
    const width = Math.min(panel.offsetWidth || 300, v.width - 2*margin);
    const height = Math.min(panel.offsetHeight || 300, v.height - 2*margin);
    const x = Math.max(v.left+margin, Math.min(anchor.left, v.left+v.width-width-margin));
    const below = anchor.bottom + 8;
    const above = anchor.top - height - 8;
    const y = below+height <= v.top+v.height-margin ? below :
      above >= v.top+margin ? above :
      Math.max(v.top+margin, Math.min(below, v.top+v.height-height-margin));
    panel.style.left=x+'px'; panel.style.top=y+'px';
    panel.style.maxWidth=(v.width-2*margin)+'px';
    panel.style.maxHeight=(v.height-2*margin)+'px';
    panel.dataset.anchorX=anchor.left;
    panel.dataset.anchorY=anchor.top;
    panel.dataset.anchorBottom=anchor.bottom;
  }
  function dismissReaction(restore=false) {
    const panel = document.getElementById('reaction-popout');
    if (panel?.matches(':popover-open')) panel.hidePopover();
    reaction=null;
    if (restore) invoker?.focus?.();
    invoker=null;
  }
  function reactionPanel() {
    let panel=document.getElementById('reaction-popout');
    if (!panel) {
      panel=document.createElement('div');
      panel.id='reaction-popout'; panel.setAttribute('popover','auto');
      panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','Choose reaction');
    }
    const host=sheet.open ? sheet : document.body;
    if (panel.parentElement!==host) host.append(panel);
    return panel;
  }
  function emojiOptions(query, limit=64) {
    return emojiChoices().filter(e=>!query || e.search.includes(query) || e.native.includes(query)).slice(0,limit);
  }
  function renderResults(panel) {
    const q=panel.querySelector('input[type=search]')?.value.trim().toLowerCase() || '';
    panel.querySelector('.reaction-results').innerHTML=emojiOptions(q).map(e=>
      `<button type="button" data-ui-emoji="${escapeHtml(e.native)}" aria-label="${escapeHtml(e.name)}">${escapeHtml(e.native)}</button>`).join('');
  }
  function openReaction(button,type,id) {
    const panel=reactionPanel();
    if (reaction?.type===type && reaction?.id===id && panel.matches(':popover-open')) {
      dismissReaction(true); return;
    }
    dismissReaction();
    reaction={type,id}; invoker=button;
    (panel.querySelector('.gw-menu-content')||panel).innerHTML=`<div class="reaction-quick" aria-label="Common reactions">${['❤️','👏','😂','🎉','🙏'].map(e=>
      `<button type="button" data-ui-emoji="${e}" aria-label="React ${e}">${e}</button>`).join('')}</div>
      <label class="sr-only" for="reaction-search">Find emoji</label>
      <input id="reaction-search" type="search" placeholder="Find emoji…" autocomplete="off">
      <div class="reaction-results emoji-grid"></div>`;
    renderResults(panel);
    panel.showPopover();
    place(panel,button.getBoundingClientRect());
  }
  function closeTransient() {
    dismissReaction();
    for (const panel of document.querySelectorAll('.attach-options[popover]:popover-open')) panel.hidePopover();
  }
  window.addEventListener('click', e => {
    const group=e.target.closest?.('[data-group-profile]');
    if (group) {
      e.preventDefault();e.stopImmediatePropagation();
      document.getElementById('member-popout')?.hidePopover?.();
      const name=group.dataset.groupProfile;
      const members=[...commentMembers.values()].filter(p=>p.membership?.groupName===name);
      modal(name+' group',`<section class="group-profile"><h2>${escapeHtml(name)}</h2><p class="muted">Shared family group</p><div class="group-members">${members.map(p=>`<button type="button" data-member-profile="${escapeHtml(p.id)}">${avatarMarkup(p.photo,p.name)}<span>${escapeHtml(p.name)}</span></button>`).join('')}</div></section>`);
      return;
    }
    const trigger=e.target.closest?.('[data-attach-trigger]');
    if (trigger) {
      e.preventDefault(); e.stopImmediatePropagation();
      const panel=document.getElementById(trigger.dataset.attachTrigger);
      if (panel.matches(':popover-open')) {panel.hidePopover();return}
      panel.showPopover(); place(panel,trigger.getBoundingClientRect()); return;
    }
    const comment=e.target.closest?.('[data-comment-react]');
    const post=e.target.closest?.('[data-react-post]');
    if (comment || post) {
      e.preventDefault(); e.stopImmediatePropagation();
      openReaction(comment||post,comment?'comment':'post',
        comment?.dataset.commentReact||post?.dataset.reactPost); return;
    }
    const emoji=e.target.closest?.('[data-ui-emoji]');
    if (emoji && reaction) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (reaction.type==='comment') {
        toggleCommentReaction(reaction.id,emoji.dataset.uiEmoji);
        dismissReaction();
        refreshCommentView();
      } else {
        toggleReaction(reaction.id,emoji.dataset.uiEmoji);
        dismissReaction();
        if (sheet.open && sheet.dataset.postId) refreshCommentView(); else render();
      }
      return;
    }
    if (reaction && !e.target.closest?.('#reaction-popout')) dismissReaction();
    if (e.target.closest?.('[data-view],[data-action],[data-family-tab],[data-reunion-tab],[data-comment-post],[data-open-post],[data-member-profile]')) closeTransient();
  },true);
  window.addEventListener('keydown',e=>{
    if (e.key==='Escape' && reaction) {
      e.preventDefault();e.stopImmediatePropagation();dismissReaction(true);
    }
  },true);
  document.addEventListener('keydown',e=>{
    const radio=e.target.closest?.('[role=radio][data-vote],[role=radio][data-local-poll]');
    if(!radio||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
    const peers=[...radio.parentElement.querySelectorAll('[role=radio]')];
    const current=peers.indexOf(radio);
    const next=e.key==='Home'?0:e.key==='End'?peers.length-1:
      (current+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+peers.length)%peers.length;
    e.preventDefault();
    const chosen=peers[next],attribute=chosen.hasAttribute('data-vote')?'data-vote':'data-option';
    const value=chosen.getAttribute(attribute),post=chosen.getAttribute('data-local-poll');
    chosen.click();
    const selector=post?`[data-local-poll="${post}"][data-option="${value}"]`:`[data-vote="${value}"]`;
    document.querySelector(selector)?.focus?.();
  });
  document.addEventListener('input',e=>{
    if (e.target.id==='reaction-search') renderResults(e.target.closest('#reaction-popout'));
  });
  document.addEventListener('change',e=>{
    if (e.target.matches?.('[data-attachment-input]'))
      e.target.closest('.attach-options')?.hidePopover?.();
  });
  window.visualViewport?.addEventListener('resize',setViewport);
  window.visualViewport?.addEventListener('scroll',setViewport);
  window.addEventListener('resize',setViewport);
  setViewport();

  const priorHome=home;
  home=function(){return priorHome().replace('<aside class="home-context"><div class="stack"><section class="card reunion-hub"><h2>Your reunion</h2>', '<aside class="home-context"><div class="feed-label"><h2>Your reunion</h2></div><div class="stack"><section class="card reunion-hub">')};
  const priorModal=modal;
  modal=function(...args){closeTransient();return priorModal(...args)};
  const priorClose=close;
  close=function(...args){closeTransient();return priorClose(...args)};
  const priorRender=render;
  render=function(...args){closeTransient();return priorRender(...args)};

  // Existing popovers remain in the top layer, but now follow the usable viewport.
  document.addEventListener('toggle',e=>{
    const panel=e.target;
    if (!panel.matches?.('#profile-popout,#notifications-popout,#member-popout,#emoji-popout')) return;
    if (panel.matches(':popover-open')) {
      const anchor=panel.id==='profile-popout'?document.getElementById('profile-toggle'):
        panel.id==='notifications-popout'?document.getElementById('notifications'):null;
      if(anchor) place(panel,anchor.getBoundingClientRect()); else setViewport();
    }
  },true);
  render();
})();
