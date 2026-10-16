(function(){
  'use strict';
  let sources=[],db=null,onChange=()=>{},currentParts=[],selected=null;
  const el=()=>document.getElementById('sourceFiles');
  const tr=s=>typeof t==='function'?t(s):s;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const write=(method,value)=>new Promise((resolve,reject)=>{if(!db)return resolve();const tx=db.transaction('sources','readwrite');tx.objectStore('sources')[method](value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  const info=s=>({id:s.id,name:s.name,size:s.size,format:s.format});
  function render(parts=currentParts){currentParts=parts;const section=el();if(!section)return;section.hidden=!sources.length;
    section.innerHTML=`<div class="section-title"><h2>${tr('Fusion source files')} <span>(${sources.length})</span></h2></div><p class="source-hint">${tr('F3D/F3Z files are reference attachments. Export STEP from Fusion and link it below for geometry-based quoting.')}</p>`+sources.map(s=>{const linked=parts.filter(p=>p.sourceFile?.id===s.id);return `<div class="source-row"><div class="source-icon">${escape(s.format)}</div><div class="source-info"><strong>${escape(s.name)}</strong><small>${(s.size/1024/1024).toFixed(2)} MB · ${linked.length?tr('Linked to quote geometry'):tr('STEP export needed')}${!db?' · '+tr('This session only'):''}</small></div><div class="source-actions"><button data-source="${s.id}" data-source-action="link">${linked.length?tr('Add more geometry'):tr('Link exported geometry')}</button><button data-source="${s.id}" data-source-action="download" aria-label="${tr('Download source')}">↓</button><button data-source="${s.id}" data-source-action="remove" aria-label="${tr('Remove source')}">×</button></div></div>`}).join('');
    section.querySelectorAll('[data-source-action]').forEach(button=>button.onclick=async()=>{const s=sources.find(s=>s.id===button.dataset.source);if(!s)return;const action=button.dataset.sourceAction;if(action==='link'){selected=info(s);document.getElementById('files').click()}else if(action==='download'){const url=URL.createObjectURL(s.file),a=document.createElement('a');a.href=url;a.download=s.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}else{try{await write('delete',s.id)}catch{toast('Could not remove the saved source file.');return}sources=sources.filter(v=>v!==s);for(const p of currentParts)if(p.sourceFile?.id===s.id)delete p.sourceFile;if(selected?.id===s.id)selected=null;onChange()}});
  }
  window.fusionSources={
    async init(change){onChange=change;try{db=await new Promise((resolve,reject)=>{const request=indexedDB.open('sophimotion-fusion-sources',1);request.onupgradeneeded=()=>request.result.createObjectStore('sources',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});sources=await new Promise((resolve,reject)=>{const request=db.transaction('sources').objectStore('sources').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});}catch{db=null}onChange()},
    async add(file){const format=file.name.split('.').pop().toUpperCase();if(!['F3D','F3Z'].includes(format))throw Error('Unsupported Fusion archive.');const existing=sources.find(s=>s.name===file.name&&s.size===file.size&&s.lastModified===file.lastModified);if(existing)return info(existing);const s={id:crypto.randomUUID(),name:file.name,size:file.size,format,lastModified:file.lastModified,file};try{await write('put',s)}catch{toast('Source file is available for this session only.');}sources.push(s);onChange();return info(s)},
    selected:()=>selected,
    clearSelection:()=>{selected=null},
    pending:parts=>sources.filter(s=>!parts.some(p=>p.sourceFile?.id===s.id)).map(info),
    metadata:()=>sources.map(info),
    render
  };
})();
