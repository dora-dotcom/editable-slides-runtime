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
(function(){
  var log=[]; function ok(n,c){log.push((c?'PASS  ':'FAIL  ')+n)}
  function q(s,r){return (r||document).querySelector(s)}
  function all(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function slides(){return all('.slides-offset > section.slide')}
  window.confirm=function(){return true};
  window.addEventListener('load',function(){setTimeout(function(){
    try{
      ensureEdit();
      var n0=slides().length;
      ok('deck starts with slides', n0>=2);

      q('#btnNewSlide').click();
      ok('New slide adds one', slides().length===n0+1);
      ok('the new slide has an edit layer', !!q('.slide-edit-layer', slides()[1]));
      ok('and is empty', all('[data-slide-object]', slides()[1]).length===0);

      q('#btnUndo').click();
      ok('adding a slide is undoable', slides().length===n0);

      // duplicate keeps oids, which is what declares a morph.
      // Adding a slide navigates to it, so come back to the first one first.
      var first=document.querySelectorAll('.filmstrip-item')[0];
      if(first) first.click();
      var src=slides()[0];
      var srcOids=all('[data-slide-object]',src).map(function(o){return o.getAttribute('data-oid')});
      q('#btnDuplicateSlide').click();
      ok('Duplicate adds one', slides().length===n0+1);
      var copy=slides()[1];
      var copyOids=all('[data-slide-object]',copy).map(function(o){return o.getAttribute('data-oid')});
      ok('the copy has the same objects', copyOids.length===srcOids.length && copyOids.length>0);
      ok('and keeps their oids, so the pair can morph',
         srcOids.every(function(id){return copyOids.indexOf(id)!==-1}));
      ok('the copy gets its own slide id', copy.id && copy.id!==src.id);
      ok('oids stay unique inside each slide',
         new Set(copyOids).size===copyOids.length);

      q('#btnUndo').click();
      ok('duplicating is undoable', slides().length===n0);

      // per-thumbnail buttons
      ok('each thumbnail offers Duplicate', all('.filmstrip-item [title="Duplicate this slide"]').length>=n0);

      // the flat insert row
      ['text','image','media','table','chart'].forEach(function(k){
        ok('the bar has a '+k+' tool', !!q('.deck-edit-chrome [data-insert="'+k+'"]'));
      });
      ok('shapes are one button with a picker', !!q('.deck-menu[data-menu="shape"] [data-menu-toggle]'));
      ok('the picker holds four shapes', all('.deck-menu[data-menu="shape"] [data-shape]').length===4);
    }catch(e){ log.push('ERROR '+e.message) }
    var p=document.createElement('pre');p.id='ops-out';p.textContent=log.join('\n');document.body.appendChild(p);
  },500)});
})();
