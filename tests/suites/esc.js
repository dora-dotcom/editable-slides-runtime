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
  function shown(s){var e=q(s);return !!e && getComputedStyle(e).display!=='none'}
  ensureView();
  ok('浏览时没有缩略图边栏', !shown('.slide-sidebar'));
  ensureEdit();
  setTimeout(function(){
    ok('编辑时缩略图边栏出现', shown('.slide-sidebar'));
    // the exact path she took: edit → present → Esc
    q('[data-present="start"]').click();
    ok('进入演示', document.body.classList.contains('deck-presenting'));
    ok('演示时缩略图边栏收起', !shown('.slide-sidebar'));
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    ok('Esc 退出演示', !document.body.classList.contains('deck-presenting'));
    ok('回到出发时的编辑器', document.body.classList.contains('deck-edit-mode'));
    ok('缩略图边栏跟着回来', shown('.slide-sidebar'));
    ok('工作文件里没有 Done 残留', !shown('.deck-btn-done'));
    // export moved to the bar
    ensureEdit();
    setTimeout(function(){
      ok('顶栏有 Export 菜单', !!q('.deck-menu[data-menu="export"]'));
      ok('复制一份在菜单里', !!q('.deck-menu[data-menu="export"] #btnSaveCopy'));
      ok('导出 PDF 在菜单里', !!q('.deck-menu[data-menu="export"] #btnExportPdf'));
      ok('边栏只剩幻灯片操作', q('.slide-sidebar').querySelectorAll(':scope > .filmstrip-actions > button').length===2);
      var em=q('.deck-menu[data-menu="export"] [data-menu-toggle]'); em.click();
      var lr=q('.deck-menu[data-menu="export"] .deck-menu-list').getBoundingClientRect();
      ok('导出菜单不越出窗口右边', lr.right<=window.innerWidth+1);
      // embedded: export and present hide together with the rest
      ok('插入图片仍然可用', !!q('[data-insert="image"]'));
      var p=document.createElement('pre');p.id='esc-out';p.textContent=log.join('\n');document.body.appendChild(p);
    },250);
  },350);
},400)});
