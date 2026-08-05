  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }
window.addEventListener('load',function(){setTimeout(function(){
  var k=document.createElement('style');k.textContent='*{transition:none!important}';document.head.appendChild(k);
  var log=[];function ok(n,c){log.push((c?'PASS  ':'FAIL  ')+n)}
  function q(s){return document.querySelector(s)}
  function all(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
  function shown(s){var e=q(s);return !!e&&getComputedStyle(e).display!=='none'}
  ok('打开就是编辑状态', document.body.classList.contains('deck-edit-mode'));
  ok('缩略图栏和检查器都在', shown('.slide-sidebar') && shown('.deck-inspector'));
  ok('顶栏有 Export', shown('.deck-menu[data-menu="export"]'));
  ok('文档可编辑', all('.slides-offset .slide-object-text').every(function(e){return e.getAttribute('contenteditable')==='true'}));
  q('#btnDoneEdit').click();
  ok('Done 退回浏览态', !document.body.classList.contains('deck-edit-mode'));
  ok('浏览态文档不可编辑', all('.slides-offset .slide-object-text').every(function(e){return e.getAttribute('contenteditable')==='false'}));
  var p=document.createElement('pre');p.id='def-out';p.textContent=log.join('\n');document.body.appendChild(p);
},700)});
