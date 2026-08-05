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
  ensureEdit();
  setTimeout(function(){
    var item=document.querySelectorAll('.filmstrip-item')[1];
    var host=item.querySelector('.filmstrip-thumb-host').getBoundingClientRect();
    function box(sel){var e=item.querySelector(sel);return e?e.getBoundingClientRect():null}
    var acts=box('.filmstrip-actions'), num=box('.filmstrip-num'), eye=box('.filmstrip-eye');
    ok('复制/删除在缩略图内', acts && acts.top>=host.top-1 && acts.right<=host.right+1);
    ok('编号在缩略图内', num && num.bottom<=host.bottom+1 && num.left>=host.left-1);
    ok('眼睛在缩略图内', eye && eye.bottom<=host.bottom+1 && eye.right<=host.right+1);
    ok('编号与眼睛底边对齐', Math.abs(num.bottom-eye.bottom)<=1);
    ok('动作组与编号左右内缩一致', Math.abs((host.right-acts.right)-(num.left-host.left))<=1);
    ok('眼睛与动作组右边对齐', Math.abs(acts.right-eye.right)<=1);
    var p=document.createElement('pre');p.id='al-out';p.textContent=log.join('\n');document.body.appendChild(p);
  },400);
},400)});
