/* Meu Vocabulário v0.1 — no external dependencies. */
(() => {
  'use strict';
  const WORDS = Array.isArray(window.VOCABULARY) ? window.VOCABULARY : [];
  const BY_ID = new Map(WORDS.map(w => [w.id, w]));
  const PROGRESS_KEY = 'por_vocab_v01_progress';
  const EVENTS_KEY = 'por_vocab_v01_events';
  const NEW_PER_DAY = 10;
  const DUE_PER_SESSION = 40;
  const $ = id => document.getElementById(id);
  const now = () => Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const dateKey = (ts = now()) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const readStore = (key, fallback) => {
    try {
      const val = JSON.parse(localStorage.getItem(key));
      return val === null ? fallback : val;
    } catch (_) { return fallback; }
  };
  let progress = readStore(PROGRESS_KEY, {});
  let events = readStore(EVENTS_KEY, []);
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) progress = {};
  if (!Array.isArray(events)) events = [];
  let page = 'home';
  let queue = [];
  let current = null;
  let shown = false;
  let session = null;
  let history = [];
  let lastShownAt = now();
  let selectedDetail = null;

  const CATEGORY_ICONS = {
    '住居':'⌂', '身体・健康':'♡', '日常表現':'✦', '仕事・ビジネス':'▣',
    'IT・テクノロジー':'⌘', '動詞':'↗', '数字・数詞':'#'
  };
  const STATUS_LABEL = {new:'未学習', learning:'学習中', familiar:'定着途中', mastered:'習得済み'};
  const POS_LABEL = {noun:'名詞', verb:'動詞', phrase:'表現', adjective:'形容詞', adverb:'副詞', numeral:'数詞'};
  const GENDER_LABEL = {m:'男性名詞', f:'女性名詞', both:'男女同形', none:''};
  const unique = arr => [...new Set(arr)];
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const recordFor = w => progress[w.id] || null;
  const statusOf = w => {
    const r = recordFor(w);
    if (!r) return 'new';
    if (r.reps >= 7 && (r.successDates || []).length >= 4) return 'mastered';
    if (r.reps >= 3) return 'familiar';
    return 'learning';
  };
  const isDue = w => {
    const r = recordFor(w);
    return !!r && (!Number.isFinite(r.nextDueAt) || r.nextDueAt <= now());
  };
  const persist = () => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
      localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-12000)));
    } catch (e) {
      console.warn('学習履歴を保存できませんでした', e);
    }
  };
  const stableShuffle = (arr, salt) => {
    const list = [...arr];
    const hash = s => { let h=2166136261; for (const c of s) { h ^= c.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; };
    list.sort((a,b) => hash(salt + a.id) - hash(salt + b.id));
    return list;
  };
  const getIntroducedToday = () => Object.values(progress).filter(r => r && r.firstSeenDate === dateKey()).length;
  const counts = () => {
    const c = {new:0, learning:0, familiar:0, mastered:0};
    for (const w of WORDS) c[statusOf(w)]++;
    return c;
  };
  const dueWords = (category='all') => WORDS.filter(w => (category === 'all' || w.category === category) && isDue(w))
    .sort((a,b) => (recordFor(a).nextDueAt || 0) - (recordFor(b).nextDueAt || 0));
  const newWords = (category='all') => stableShuffle(WORDS.filter(w => (category === 'all' || w.category === category) && !recordFor(w)), dateKey());
  const getStreak = () => {
    const days = new Set(events.map(e => e.date).filter(Boolean));
    if (!days.size) return 0;
    const cursor = new Date(); cursor.setHours(12,0,0,0);
    if (!days.has(dateKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
    let count=0;
    while (days.has(dateKey(cursor.getTime()))) { count++; cursor.setDate(cursor.getDate()-1); }
    return count;
  };
  const setText = (id, text) => { const el=$(id); if (el) el.textContent=String(text); };
  const setHidden = (id, hide) => { const el=$(id); if (el) el.classList.toggle('hidden', !!hide); };
  const makeEl = (tag, cls, text) => {
    const el=document.createElement(tag); if (cls) el.className=cls; if (text !== undefined) el.textContent=text; return el;
  };
  const labelOf = w => [POS_LABEL[w.pos] || w.pos, GENDER_LABEL[w.gender] || ''].filter(Boolean).join(' · ');

  function renderHome() {
    const c=counts();
    const due=dueWords().length;
    const today=events.filter(e=>e.date===dateKey());
    const seconds=today.reduce((s,e)=>s+(Number(e.seconds)||0),0);
    setText('statMastered', `${c.mastered} / ${WORDS.length}語`);
    setText('statDue', `${due}語`);
    setText('statLearning', `${c.learning+c.familiar}語`);
    setText('statToday', `${today.length}回 · ${Math.floor(seconds/60)}分`);
    setText('streakBadge', `${getStreak()}日継続`);
    setText('totalLabel', `全${WORDS.length}語`);
    for (const k of ['mastered','familiar','learning','new']) {
      setText('count'+k[0].toUpperCase()+k.slice(1), c[k]);
      if (k !== 'new') $('bar'+k[0].toUpperCase()+k.slice(1)).style.width = `${WORDS.length ? 100*c[k]/WORDS.length : 0}%`;
    }
    const budget=Math.max(0, NEW_PER_DAY-getIntroducedToday());
    const allowed=due>25 ? 0 : due>12 ? Math.min(budget,5) : budget;
    setText('planSummary', `復習 ${due}語 · 新規 最大${allowed}語（1日の上限${NEW_PER_DAY}語）`);
  }

  function renderCategories() {
    const grid=$('categoryGrid'); grid.replaceChildren();
    const countsBy={};
    for (const w of WORDS) countsBy[w.category]=(countsBy[w.category]||0)+1;
    for (const [name,count] of Object.entries(countsBy)) {
      const btn=makeEl('button','category-btn'); btn.type='button';
      const label=makeEl('span','',`${CATEGORY_ICONS[name] || '•'}  ${name}`);
      const n=makeEl('small','',`${count}語`);
      btn.append(label,n); btn.addEventListener('click',()=>startSession('category',name)); grid.append(btn);
    }
    const sel=$('dictCategory');
    for (const name of Object.keys(countsBy)) {
      const o=document.createElement('option'); o.value=name; o.textContent=name; sel.append(o);
    }
  }

  function setPage(next) {
    if (next==='study' && !session) startSession('today');
    page=next;
    for (const name of ['home','study','dictionary']) setHidden('page-'+name,name!==page);
    for (const btn of document.querySelectorAll('.nav-btn')) btn.classList.toggle('active',btn.dataset.page===page);
    setHidden('actionDock',page!=='study' || !current);
    if (page==='home') renderHome();
    if (page==='dictionary') renderDictionary();
    if (page==='study') renderStudy();
    window.scrollTo({top:0,behavior:'instant'});
  }

  function startSession(mode='today',category='all') {
    let list=[];
    const due=dueWords(category);
    const remaining=Math.max(0,NEW_PER_DAY-getIntroducedToday());
    const budget=due.length>25 ? 0 : due.length>12 ? Math.min(remaining,5) : remaining;
    if (mode==='today' || mode==='category') {
      list=[...due.slice(0,DUE_PER_SESSION),...newWords(category).slice(0,budget)];
    } else if (mode==='new') {
      list=newWords(category).slice(0,remaining);
    } else if (mode==='weak') {
      list=WORDS.filter(w => (category==='all'||w.category===category) && recordFor(w) &&
        ((recordFor(w).lastGrade??2)<2 || (recordFor(w).lapses||0)>0) && statusOf(w)!=='mastered')
        .sort((a,b) => (recordFor(b).lapses||0)-(recordFor(a).lapses||0)).slice(0,35);
    }
    const modeLabel=mode==='today'?'今日の学習':mode==='new'?'新しい単語':mode==='weak'?'苦手語彙':category;
    queue=list.map(w=>({id:w.id,repeat:false}));
    session={mode,category,modeLabel,initialTotal:list.length,completed:0,reviewed:0,gradeCounts:{0:0,1:0,2:0},attempts:{}};
    history=[];
    current=queue.shift() || null;
    shown=false;
    lastShownAt=now();
    setPage('study');
  }

  function renderStudy() {
    if (page!=='study') return;
    const finished=!current;
    setHidden('studyCard',finished);
    setHidden('studyFinished',!finished);
    setHidden('studyHint',finished);
    setHidden('actionDock',finished);
    setText('studyMode',session?.modeLabel||'今日の学習');
    if (finished) {
      const n=session?.reviewed||0;
      setText('finishSummary',n ? `確認 ${n}回 · 覚えた ${session.gradeCounts[2]}回 · あやふや ${session.gradeCounts[1]}回 · 知らない ${session.gradeCounts[0]}回` : '今は出題対象がありません。復習期限や新規枠を確認してください。');
      setText('studyCounter',`${n}回`);
      $('studyProgressFill').style.width='100%';
      return;
    }
    const w=BY_ID.get(current.id);
    if (!w) { current=queue.shift()||null; renderStudy(); return; }
    const r=recordFor(w);
    const recall=!!r && r.reps>=3;
    setText('studyCategory',w.category+(current.repeat?' · 再確認':''));
    setText('studyDirection',recall?'日本語 → Português':'Português → 日本語');
    setText('studyInstruction',recall?'ポルトガル語を思い出してください':'意味を思い出してください');
    setText('studyPrompt',recall?w.meanings.join('、'):w.pt);
    setText('answerMain',recall?w.pt:w.meanings.join('、'));
    setText('answerMeta',labelOf(w));
    const coll=$('collocationList'); coll.replaceChildren();
    for (const s of (w.collocations||[]).slice(0,5)) coll.append(makeEl('span','chip',s));
    setHidden('answerCollocations',!w.collocations?.length);
    setText('examplePt',w.examplePt||'');
    setText('exampleJa',w.exampleJa||'');
    setHidden('answerExample',!w.examplePt);
    setText('answerSource',w.source ? `出典：${w.source}` : '');
    setHidden('studyAnswer',!shown);
    setHidden('revealBtn',shown);
    setHidden('ratingButtons',!shown);
    $('previousBtn').disabled=history.length===0;
    setText('dockTip',shown?'自己評価して次へ':'まず頭の中で答える');
    const done=session?.completed||0;
    const remaining=queue.length+1;
    setText('studyCounter',`${done+1} / ${done+remaining}`);
    $('studyProgressFill').style.width=`${100*done/Math.max(1,done+remaining)}%`;
  }

  function showAnswer() {
    if (!current || shown) return;
    shown=true;
    renderStudy();
  }

  function grade(gradeValue) {
    if (!current || !shown || !session) return;
    const w=BY_ID.get(current.id);
    if (!w) return;
    history.push({progress:clone(progress),events:clone(events),queue:clone(queue),current:clone(current),session:clone(session)});
    if (history.length>15) history.shift();
    const old=recordFor(w);
    const rec=old ? {...old} : {firstSeenDate:dateKey(),reps:0,lapses:0,successDates:[],nextDueAt:0};
    const t=now();
    rec.lastReviewedAt=t;
    rec.lastGrade=gradeValue;
    const attempts=(session.attempts[w.id]||0)+1;
    session.attempts[w.id]=attempts;
    let repeat=false;
    if (gradeValue===2) {
      rec.reps=(rec.reps||0)+1;
      rec.successDates=unique([...(rec.successDates||[]),dateKey()]);
      const intervals=[0,1,1,3,7,14,30,60];
      const days=intervals[Math.min(rec.reps,intervals.length-1)];
      rec.intervalDays=days;
      rec.nextDueAt=t+(days||1)*DAY_MS;
      repeat=rec.reps===1 && attempts<3;
    } else {
      if (gradeValue===0) {
        rec.reps=0; rec.lapses=(rec.lapses||0)+1;
      } else {
        rec.reps=Math.max(0,(rec.reps||0)-1);
      }
      rec.intervalDays=1;
      rec.nextDueAt=t+DAY_MS;
      repeat=attempts<3;
    }
    progress[w.id]=rec;
    const seconds=Math.max(1,Math.min(180,Math.round((t-lastShownAt)/1000)));
    events.push({id:w.id,date:dateKey(t),timestamp:t,grade:gradeValue,seconds,mode:session.mode});
    if (events.length>12000) events=events.slice(-12000);
    session.reviewed++;
    session.completed++;
    session.gradeCounts[gradeValue]++;
    if (repeat && !queue.some(x=>x.id===w.id)) {
      const at=Math.min(queue.length,gradeValue===1?9:6);
      queue.splice(at,0,{id:w.id,repeat:true});
    }
    current=queue.shift()||null;
    shown=false;
    lastShownAt=now();
    persist();
    renderStudy();
  }

  function previous() {
    if (!history.length || !session) return;
    const snap=history.pop();
    progress=snap.progress;
    events=snap.events;
    queue=snap.queue;
    current=snap.current;
    session=snap.session;
    shown=true;
    lastShownAt=now();
    persist();
    renderStudy();
  }

  function renderDictionary() {
    if (page!=='dictionary') return;
    const search=$('dictSearch').value.trim().toLocaleLowerCase();
    const category=$('dictCategory').value;
    const stage=$('dictStage').value;
    const result=WORDS.filter(w => {
      if (category!=='all' && w.category!==category) return false;
      if (stage!=='all' && statusOf(w)!==stage) return false;
      if (!search) return true;
      return [w.pt,...w.meanings,...(w.collocations||[])].join(' ').toLocaleLowerCase().includes(search);
    }).sort((a,b)=>a.pt.localeCompare(b.pt,'pt-BR'));
    setText('dictTotal',`${WORDS.length}語`);
    setText('dictCount',`${result.length}語を表示`);
    const wrap=$('dictResults'); wrap.replaceChildren();
    if (!result.length) wrap.append(makeEl('p','empty-note','該当する単語がありません。'));
    for (const w of result) {
      const btn=makeEl('button','word-row'); btn.type='button';
      const left=makeEl('div'); left.append(makeEl('div','word-main',w.pt));
      left.append(makeEl('div','word-sub',`${w.meanings.join('、')} · ${labelOf(w)}`));
      const right=makeEl('span','word-state '+statusOf(w),STATUS_LABEL[statusOf(w)]);
      btn.append(left,right); btn.addEventListener('click',()=>showDictionaryDetail(w.id));
      wrap.append(btn);
    }
    if (selectedDetail && !result.some(w=>w.id===selectedDetail)) setHidden('dictDetail',true);
  }

  function showDictionaryDetail(id) {
    const w=BY_ID.get(id); if (!w) return;
    selectedDetail=id;
    const el=$('dictDetail'); el.replaceChildren();
    const head=makeEl('div','detail-head');
    const info=makeEl('div');
    info.append(makeEl('h3','detail-title',w.pt));
    info.append(makeEl('p','detail-meanings',w.meanings.join('、')));
    info.append(makeEl('p','detail-sub',`${labelOf(w)} · ${w.category} · ${STATUS_LABEL[statusOf(w)]}`));
    const close=makeEl('button','detail-close','×'); close.type='button'; close.setAttribute('aria-label','閉じる');
    close.addEventListener('click',()=>setHidden('dictDetail',true));
    head.append(info,close); el.append(head);
    if (w.collocations?.length) {
      el.append(makeEl('p','mini-label','よく使う形・関連表現'));
      const chips=makeEl('div','chips');
      for (const c of w.collocations) chips.append(makeEl('span','chip',c));
      el.append(chips);
    }
    const ex=makeEl('div','detail-example');
    ex.append(makeEl('p','example-pt',w.examplePt||''));
    ex.append(makeEl('p','example-ja',w.exampleJa||''));
    ex.append(makeEl('p','answer-source',`出典：${w.source||'補充学習'}`));
    el.append(ex);
    setHidden('dictDetail',false);
    el.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function init() {
    if (!WORDS.length) {
      setText('planSummary','語彙データを読み込めませんでした。vocabulary.js が index.html と同じ場所にあるか確認してください。');
      $('startToday').disabled=true;
      return;
    }
    renderCategories();
    document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>setPage(btn.dataset.page)));
    $('startToday').addEventListener('click',()=>startSession('today'));
    $('startNew').addEventListener('click',()=>startSession('new'));
    $('startWeak').addEventListener('click',()=>startSession('weak'));
    $('studyBack').addEventListener('click',()=>setPage('home'));
    $('finishHome').addEventListener('click',()=>setPage('home'));
    $('revealBtn').addEventListener('click',showAnswer);
    $('previousBtn').addEventListener('click',previous);
    document.querySelectorAll('[data-grade]').forEach(btn=>btn.addEventListener('click',()=>grade(Number(btn.dataset.grade))));
    for (const id of ['dictSearch','dictCategory','dictStage']) $(id).addEventListener(id==='dictSearch'?'input':'change',renderDictionary);
    renderHome();
  }
  init();
})();
