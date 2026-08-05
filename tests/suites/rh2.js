  // The deck now opens in edit mode, so a suite must ensure the state it needs
  // rather than toggle blindly.
  function ensureEdit(){ if(!document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('editToggle'); if(b) b.click(); } }
  function ensureView(){ if(document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('btnDoneEdit'); if(b) b.click(); } }
window.addEventListener('load',function(){setTimeout(function(){
  var k=document.createElement('style');k.textContent='*{transition:none!important}';document.head.appendChild(k);
  var log=[];function ok(n,c){log.push((c?'PASS  ':'FAIL  ')+n)}
  function q(s){return document.querySelector(s)}
  ensureEdit();
  setTimeout(function(){
    var h=q('.deck-panel-handle--right'), r=h.getBoundingClientRect();
    ok('右把手在视口内', r.left>=0 && r.right<=window.innerWidth);
    ok('右把手贴着面板内侧', Math.abs(r.right - (window.innerWidth-264)) < 4);
    var top=document.elementFromPoint(Math.round((r.left+r.right)/2), Math.round((r.top+r.bottom)/2));
    ok('该位置能点到把手', top===h || h.contains(top));
    h.click();
    ok('点击收起面板', q('.deck-inspector').getBoundingClientRect().width<2);
    h.click();
    ok('再点展开', q('.deck-inspector').getBoundingClientRect().width>100);
    // skip follows the selected slide
    var items=Array.prototype.slice.call(document.querySelectorAll('.filmstrip-item'));
    items[1].querySelector('.filmstrip-eye').click();
    document.querySelectorAll('.filmstrip-item')[0].click();
    ok('切到未跳过的页，勾选为空', q('[data-slide-skip]').checked===false);
    document.querySelectorAll('.filmstrip-item')[1].click();
    ok('切到被跳过的页，勾选自动打上', q('[data-slide-skip]').checked===true);
    // slide sits inside the canvas with room around it
    var s=document.querySelector('.slides-offset > section.slide').getBoundingClientRect();
    var c=q('.slides-offset').getBoundingClientRect();
    ok('幻灯片两侧留白 ≥ 40px', (s.left-c.left)>=40 && (c.right-s.right)>=40);
    ok('左右留白相等', Math.abs((s.left-c.left)-(c.right-s.right))<=2);
    var p=document.createElement('pre');p.id='rh-out';p.textContent=log.join('\n');document.body.appendChild(p);
  },450);
},400)});
