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
    var slide=q('.slides-offset > section.slide'), canvas=q('.slides-offset');
    var s=slide.getBoundingClientRect(), c=canvas.getBoundingClientRect();
    ok('幻灯片完整落在画布内', s.left>=c.left-1 && s.right<=c.right+1);
    ok('左右留白相等', Math.abs((s.left-c.left)-(c.right-s.right))<=2);
    ok('画布没有横向滚动', canvas.scrollWidth<=canvas.clientWidth+1);
    ok('比例仍是 16:9', Math.abs(s.width/s.height-16/9)<0.02);
    var w0=s.width;
    q('[data-zoom="+"]').click();
    var s1=slide.getBoundingClientRect();
    ok('放大后更大', s1.width>w0+2);
    q('[data-zoom="fit"]').click();
    var s2=slide.getBoundingClientRect();
    ok('Fit 后又完整落在画布内', s2.left>=c.left-1 && s2.right<=c.right+1);
    // dragging maths must survive the zoom: object percentages unchanged
    var obj=q('.slides-offset [data-slide-object]');
    var pctBefore=obj.style.left;
    var or_=obj.getBoundingClientRect(), sr=slide.getBoundingClientRect();
    var measured=(or_.left-sr.left)/sr.width*100;
    ok('缩放后对象的百分比位置仍然吻合', Math.abs(measured-parseFloat(pctBefore))<0.6);
    var p=document.createElement('pre');p.id='z2-out';p.textContent=log.join('\n');document.body.appendChild(p);
  },500);
},400)});
