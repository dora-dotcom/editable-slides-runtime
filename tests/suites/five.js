  // The deck now opens in edit mode, so a suite must ensure the state it needs
  // rather than toggle blindly.
  function ensureEdit(){ if(!document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('editToggle'); if(b) b.click(); } }
  function ensureView(){ if(document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('btnDoneEdit'); if(b) b.click(); } }
window.addEventListener('load',function(){setTimeout(function(){
  var k=document.createElement('style');k.textContent='*{transition:none!important;animation:none!important}';document.head.appendChild(k);
  var log=[];function ok(n,c){log.push((c?'PASS  ':'FAIL  ')+n)}
  function q(s){return document.querySelector(s)}
  function all(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
  ensureEdit();
  setTimeout(function(){
    // 1 badge position
    var n=q('.filmstrip-num'), host=n.parentElement;
    var nr=n.getBoundingClientRect(), hr=host.getBoundingClientRect();
    ok('编号在缩略图左下角', nr.bottom > hr.top + hr.height*0.6 && nr.left < hr.left + hr.width*0.4);
    // 2 skip really sticks when clicked like a user
    var sk=q('[data-slide-skip]');
    sk.click();
    ok('点击后复选框保持勾选', sk.checked===true);
    ok('文档记录了跳过', all('.slides-offset > section.slide')[0].hasAttribute('data-skip'));
    ok('缩略图反映了跳过', all('.filmstrip-item')[0].classList.contains('is-skipped'));
    sk.click();
    ok('再点取消', !all('.slides-offset > section.slide')[0].hasAttribute('data-skip'));
    // 3 background controls
    ok('有背景图入口', !!q('[data-slide-bg-image]'));
    ok('有图片尺寸选项', !!q('[data-bg-size]'));
    ok('有图片不透明度', !!q('[data-bg-opacity]'));
    ok('没有图片时这些是收起的', q('#bgImageRow').hidden===true);
    // 4 right panel collapse actually changes the layout
    var insp=q('.deck-inspector');
    var w0=insp.getBoundingClientRect().width;
    q('.deck-panel-handle--right').click();
    var w1=insp.getBoundingClientRect().width;
    ok('右面板收起后宽度归零', w0>100 && w1<2);
    q('.deck-panel-handle--right').click();
    ok('再点恢复', insp.getBoundingClientRect().width>100);
    // 5 margins stay even when the left collapses
    function margins(){var s=all('.slides-offset > section.slide')[0].getBoundingClientRect();
      var c=q('.slides-offset').getBoundingClientRect();
      return [Math.round(s.left-c.left), Math.round(c.right-s.right)];}
    var m0=margins();
    q('.deck-panel-handle--left').click();
    var m1=margins();
    ok('左面板收起前左右边距相等', Math.abs(m0[0]-m0[1])<=2);
    ok('收起后仍然相等', Math.abs(m1[0]-m1[1])<=2);
    var p=document.createElement('pre');p.id='five-out';p.textContent=log.join('\n');document.body.appendChild(p);
  },450);
},400)});
