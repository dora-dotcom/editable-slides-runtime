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
  ensureEdit();
  setTimeout(function(){
    var items=all('.filmstrip-item');
    ok('每个缩略图都有眼睛', all('.filmstrip-eye').length===items.length);
    var eye=items[1].querySelector('.filmstrip-eye');
    var r=eye.getBoundingClientRect(), hr=items[1].querySelector('.filmstrip-thumb-host').getBoundingClientRect();
    ok('眼睛在右下角', r.right > hr.left+hr.width*0.6 && r.bottom > hr.top+hr.height*0.6);
    ok('平时是隐藏的', getComputedStyle(eye).opacity==='0');

    eye.click();
    var slides=all('.slides-offset > section.slide');
    ok('点眼睛把这一页设为跳过', slides[1].hasAttribute('data-skip'));
    var eye2=all('.filmstrip-item')[1].querySelector('.filmstrip-eye');
    ok('跳过后眼睛常驻', getComputedStyle(eye2).opacity==='1');
    ok('图标换成了划掉的眼睛', eye2.innerHTML.indexOf('M4 4l16 16')!==-1);

    // panel and filmstrip agree
    var sidebarItems=all('.filmstrip-item');
    sidebarItems[1].click();
    ok('面板里的勾选跟着变', q('[data-slide-skip]').checked===true);
    q('[data-slide-skip]').click();
    ok('从面板取消，文档也跟着变', !all('.slides-offset > section.slide')[1].hasAttribute('data-skip'));
    ok('缩略图的眼睛也恢复', all('.filmstrip-item')[1].querySelector('.filmstrip-eye').innerHTML.indexOf('M4 4l16 16')===-1);

    // icons are svg, not glyphs
    var dup=all('.filmstrip-item')[0].querySelector('[aria-label="Duplicate slide"]');
    ok('复制是 SVG 图标', !!dup.querySelector('svg'));
    ok('删除是 SVG 图标', !!all('.filmstrip-item')[0].querySelector('[aria-label="Delete slide"] svg'));
    var p=document.createElement('pre');p.id='eye-out';p.textContent=log.join('\n');document.body.appendChild(p);
  },450);
},400)});
