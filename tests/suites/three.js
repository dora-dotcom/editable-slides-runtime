  // The deck now opens in edit mode, so a suite must ensure the state it needs
  // rather than toggle blindly.
  function ensureEdit(){ if(!document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('editToggle'); if(b) b.click(); } }
  function ensureView(){ if(document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('btnDoneEdit'); if(b) b.click(); } }
window.addEventListener('load',function(){setTimeout(function(){
  var k=document.createElement('style');k.textContent='*{transition:none!important;animation:none!important}';document.head.appendChild(k);
  var o=[],log=[];function ok(n,c){log.push((c?'PASS  ':'FAIL  ')+n)}
  function all(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
  ensureEdit();
  setTimeout(function(){
    // 1 badge
    var nums=all('.filmstrip-num');
    ok('每个缩略图都有编号角标', nums.length===all('.filmstrip-item').length && nums.length>0);
    ok('角标显示的是页码', nums[0] && nums[0].textContent==='1');
    // 3 move handles on every object
    var objs=all('.slides-offset [data-slide-object]');
    ok('每个对象都有移动手柄', objs.length>0 && objs.every(function(o){return !!o.querySelector('.slide-object-move')}));
    ok('移动手柄可见', objs[0] && getComputedStyle(objs[0].querySelector('.slide-object-move')).display!=='none');
    // 2 panel handles
    var lh=document.querySelector('.deck-panel-handle--left'), rh=document.querySelector('.deck-panel-handle--right');
    ok('左侧把手可见', lh && getComputedStyle(lh).display!=='none');
    ok('右侧把手可见', rh && getComputedStyle(rh).display!=='none');
    rh.click();
    ok('点右把手收起属性面板', document.body.classList.contains('deck-hide-right'));
    rh.click();
    ok('再点展开', !document.body.classList.contains('deck-hide-right'));
    // 4 skip
    var sk=document.querySelector('[data-slide-skip]');
    ok('有跳过演示的开关', !!sk);
    var slides=all('.slides-offset > section.slide');
    var before=slides[0].querySelector('[data-field="pages"]');
    var total=before?before.textContent:'';
    sk.checked=true; sk.dispatchEvent(new Event('change',{bubbles:true}));
    ok('勾选后这一页被标记跳过', slides[0].hasAttribute('data-skip'));
    var after=slides[1].querySelector('[data-field="pages"]');
    ok('总页数少了一页', after && after.textContent===String(parseInt(total,10)-1));
    ok('被跳过的页在缩略图里变灰', all('.filmstrip-item')[0].classList.contains('is-skipped'));
    document.getElementById('btnUndo').click();
    ok('跳过可以撤销', !slides[0].hasAttribute('data-skip'));
    var p=document.createElement('pre');p.id='three-out';p.textContent=log.join('\n');document.body.appendChild(p);
  },400);
},400)});
