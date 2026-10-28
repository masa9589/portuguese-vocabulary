/* Local-only audio library. MP3 files never leave the device. */
(() => {
  'use strict';
  const DB_NAME='meu_vocab_audio_v1';
  const STORE='tracks';
  const $=id=>document.getElementById(id);
  let activeUrl=null;
  let currentId=null;
  function openDB(){return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('このブラウザでは端末内音声保存が利用できません。'));return;}
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });}
  async function withStore(mode,action){const db=await openDB();return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);const store=tx.objectStore(STORE);
    const req=action(store);let result;
    req.onsuccess=()=>{result=req.result;};req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};
    tx.onabort=()=>{db.close();reject(tx.error);};
  });}
  const getAll=()=>withStore('readonly',s=>s.getAll());
  const get=id=>withStore('readonly',s=>s.get(id));
  const put=x=>withStore('readwrite',s=>s.put(x));
  const remove=id=>withStore('readwrite',s=>s.delete(id));
  const fileId=name=>name.trim().toLocaleLowerCase('pt-BR');
  const numeric=n=>{const m=n.match(/faixa\s*(\d+)/i);return m?Number(m[1]):Infinity;};
  function message(msg){if($('audioImportStatus'))$('audioImportStatus').textContent=msg;}
  function stop(){const player=$('audioPlayer');if(player){player.pause();player.removeAttribute('src');player.load();}if(activeUrl)URL.revokeObjectURL(activeUrl);activeUrl=null;currentId=null;}
  async function play(id){try{
    const item=await get(id);if(!item)return;
    stop();currentId=id;activeUrl=URL.createObjectURL(item.blob);const player=$('audioPlayer');player.src=activeUrl;
    $('audioNowPlaying').textContent='再生中：'+item.name;
    await player.play();
  }catch(e){$('audioNowPlaying').textContent='再生できません：'+(e.message||e);}}
  async function refresh(){const list=$('audioList');if(!list)return;
    try{const items=await getAll();items.sort((a,b)=>numeric(a.name)-numeric(b.name)||a.name.localeCompare(b.name));list.replaceChildren();
      const mb=items.reduce((n,x)=>n+(Number(x.size)||0),0)/1048576;
      message(`この端末に ${items.length}本保存済み（約${mb.toFixed(1)}MB）。保存容量はブラウザ・端末によって異なります。`);
      if(!items.length){const p=document.createElement('p');p.className='muted';p.textContent='まだ音声がありません。上のボタンからMP3を選んでください。';list.append(p);return;}
      for(const item of items){const row=document.createElement('div');row.className='audio-item';
        const btn=document.createElement('button');btn.type='button';btn.className='audio-play';btn.textContent='▶ '+item.name;btn.addEventListener('click',()=>play(item.id));
        const del=document.createElement('button');del.type='button';del.className='audio-delete';del.textContent='削除';del.setAttribute('aria-label',item.name+'を端末から削除');
        del.addEventListener('click',async()=>{if(!confirm(item.name+'をこの端末から削除しますか？'))return;if(currentId===item.id)stop();await remove(item.id);refresh();});
        row.append(btn,del);list.append(row);
      }
    }catch(e){message('音声ライブラリを開けません：'+(e.message||e));}}
  async function importFiles(files){if(!files?.length)return;
    let done=0,failed=0;for(const file of files){if(!(file.type.startsWith('audio/')||/\.(mp3|m4a|wav|ogg)$/i.test(file.name))){failed++;continue;}
      try{await put({id:fileId(file.name),name:file.name,blob:file,size:file.size,updatedAt:Date.now()});done++;message(`${done}/${files.length}本を保存中...`);}catch(e){failed++;console.warn('Audio import failed',file.name,e);}
    }
    await refresh();if(failed)message(`${done}本保存、${failed}本は保存できませんでした。容量や形式を確認してください。`);
  }
  window.refreshAudioLibrary=refresh;
  window.addEventListener('DOMContentLoaded',()=>{
    const input=$('audioImport');if(input)input.addEventListener('change',async()=>{const files=Array.from(input.files||[]);input.value='';await importFiles(files);});
    refresh();
  });
})();
