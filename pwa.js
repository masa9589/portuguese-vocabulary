(() => {
  const updateStatus = (msg) => {const el=document.getElementById('offlineStatus');if(el)el.textContent=msg;};
  if (!('serviceWorker' in navigator)) {updateStatus('このブラウザはオフライン機能に対応していません。');return;}
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then(()=>navigator.serviceWorker.ready).then(()=>{
      updateStatus(navigator.onLine?'オフライン準備済み：この端末でテキスト学習できます。':'オフラインで学習中：履歴は端末に保存されます。');
    }).catch(err=>{console.warn('Offline setup unavailable:',err);updateStatus('オフライン準備に失敗しました。オンラインで再読み込みしてください。');});
    window.addEventListener('online',()=>updateStatus('オンラインです。オフライン準備を確認しています。'));
    window.addEventListener('offline',()=>updateStatus('オフラインで学習中：履歴は端末に保存されます。'));
  });
})();
