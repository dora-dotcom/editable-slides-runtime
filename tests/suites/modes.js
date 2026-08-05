  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }
  // The deck now opens in edit mode, so a suite must ensure the state it needs
  // rather than toggle blindly.
  function ensureEdit(){ if(!document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('editToggle'); if(b) b.click(); } }
  function ensureView(){ if(document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('btnDoneEdit'); if(b) b.click(); } }
window.addEventListener('load',function(){setTimeout(function(){
  var k=document.createElement('style');k.textContent='*{transition:none!important}';document.head.appendChild(k);
  var log=[];function ok(n,c){log.push((c?'PASS  ':'FAIL  ')+n)}
  function q(s){return document.querySelector(s)}
  function all(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
  function shown(s){var e=q(s);return !!e&&getComputedStyle(e).display!=='none'}

  // --- VIEW ---
  // The deck opens in edit mode now, so the view assertions need view first.
  ensureView();
  ok('浏览时文档不可编辑', all('.slides-offset .slide-object-text').every(function(e){return e.getAttribute('contenteditable')==='false'}));
  ok('浏览时标题不可编辑', q('#deckTitle').getAttribute('contenteditable')==='false');
  ok('浏览时没有 Export', !shown('.deck-menu[data-menu="export"]'));
  ok('浏览时没有缩略图栏', !shown('.slide-sidebar'));
  ok('浏览时没有检查器', !shown('.deck-inspector'));
  ok('浏览时没有缩放控件', !shown('.deck-zoom'));
  ok('浏览时没有 Done', !shown('.deck-btn-done'));
  ok('浏览时有 Present 入口', !!q('.deck-btn-view-present'));

  // --- EDIT ---
  ensureEdit();
  setTimeout(function(){
    ok('编辑时文档可编辑', all('.slides-offset .slide-object-text').every(function(e){return e.getAttribute('contenteditable')==='true'}));
    ok('编辑时标题可编辑', q('#deckTitle').getAttribute('contenteditable')==='true');
    ok('编辑时有 Export', shown('.deck-menu[data-menu="export"]'));
    ok('编辑时有缩略图栏和检查器', shown('.slide-sidebar') && shown('.deck-inspector'));

    // --- PRESENT ---
    q('[data-present="start"]').click();
    ok('演示时文档回到不可编辑', all('.slides-offset .slide-object-text').every(function(e){return e.getAttribute('contenteditable')==='false'}));
    ok('演示时没有 Export', !shown('.deck-menu[data-menu="export"]'));
    ok('演示时没有编辑外壳', !shown('.slide-sidebar') && !shown('.deck-inspector') && !shown('.deck-zoom'));
    ok('演示时有控制条', !!q('.deck-present-bar'));

    // --- back to where the show started ---
    // Presenting sits on top of what you were doing; it does not move you.
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    ok('Esc 退出演示', !document.body.classList.contains('deck-presenting'));
    ok('回到的是出发时的编辑器', document.body.classList.contains('deck-edit-mode'));
    ok('文档又可编辑了', all('.slides-offset .slide-object-text').every(function(e){return e.getAttribute('contenteditable')==='true'}));
    ok('Export 也回来了', shown('.deck-menu[data-menu="export"]'));
    var p=document.createElement('pre');p.id='mode-out';p.textContent=log.join('\n');document.body.appendChild(p);
  },400);
},400)});
