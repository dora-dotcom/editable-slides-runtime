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
  ensureEdit();
  setTimeout(function(){
    ok('缩放控件出现在编辑模式', getComputedStyle(q('.deck-zoom')).display!=='none');
    var z=q('.deck-zoom').getBoundingClientRect();
    ok('在右下角', z.bottom>window.innerHeight*0.8 && z.right>window.innerWidth*0.5);
    var slide=q('.slides-offset > section.slide');
    var w0=slide.getBoundingClientRect().width;
    ok('默认是 Fit', q('#deckZoomLevel').textContent==='Fit');
    q('[data-zoom="+"]').click();
    var w1=slide.getBoundingClientRect().width;
    ok('放大后幻灯片变大', w1>w0+2);
    ok('显示百分比', /%$/.test(q('#deckZoomLevel').textContent));
    q('[data-zoom="-"]').click(); q('[data-zoom="-"]').click();
    ok('缩小后变小', slide.getBoundingClientRect().width<w1-2);
    q('[data-zoom="fit"]').click();
    ok('回到 Fit', q('#deckZoomLevel').textContent==='Fit');
    ok('幻灯片本身仍是 16:9', Math.abs(slide.getBoundingClientRect().width/slide.getBoundingClientRect().height-16/9)<0.05);
    // icons centred
    var it=document.querySelectorAll('.filmstrip-item')[1];
    var b=it.querySelector('[aria-label="Duplicate slide"]');
    var br=b.getBoundingClientRect(), sr=b.querySelector('svg').getBoundingClientRect();
    ok('复制图标垂直居中', Math.abs((sr.top-br.top)-(br.bottom-sr.bottom))<=1);
    ok('复制图标水平居中', Math.abs((sr.left-br.left)-(br.right-sr.right))<=1);
    var d=it.querySelector('[aria-label="Delete slide"]');
    var dr=d.getBoundingClientRect(), dsr=d.querySelector('svg').getBoundingClientRect();
    ok('删除图标垂直居中', Math.abs((dsr.top-dr.top)-(dr.bottom-dsr.bottom))<=1);
    // narrower filmstrip
    ok('缩略图栏比之前窄', q('.slide-sidebar').getBoundingClientRect().width<200);
    var p=document.createElement('pre');p.id='z-out';p.textContent=log.join('\n');document.body.appendChild(p);
  },450);
},400)});
