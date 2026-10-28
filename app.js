/* Meu Vocabulario v0.2 — learning system, data independent. */
(() => {
  'use strict';
  const WORDS = Array.isArray(window.VOCABULARY) ? window.VOCABULARY.filter(w => w && w.id && w.pt && Array.isArray(w.meanings) && w.meanings.length) : [];
  const BY_ID = new Map(WORDS.map(w => [w.id, w]));
  const KEY = 'por_vocab_v02_progress';
  const EVENT_KEY = 'por_vocab_v02_events';
  const CYCLE_KEY = 'por_vocab_v02_cycles';
  const SESSION_KEY = 'por_vocab_v02_session';
  const LESSONS = Array.isArray(window.LESSONS) ? window.LESSONS : [];
  const MAX_EVENT_LOG = 18000;
  const NEW_PER_DAY = 10;
  const SESSION_REVIEW_MAX = 38;
  const CATEGORY_SESSION_MAX = 22;
  const STATUS = {new:'未学習',learning:'学習中',familiar:'定着途中',mastered:'習得済み'};
  const POS = {noun:'名詞',verb:'動詞',adjective:'形容詞',adverb:'副詞',phrase:'表現',numeral:'数詞'};
  const CAT_ICON = {'住居':'⌂','身体・健康':'♡','健康・医療':'✚','動詞':'↗','日常表現':'✦','仕事・ビジネス':'▣','IT・テクノロジー':'⌘','数字・数詞':'#','人・家族':'♧','交通・街':'◇','食事':'♨','衣服・持ち物':'◈','形容詞・状態':'◉','時間・頻度':'◷','生活・身の回り':'⌂'};
  const $ = id => document.getElementById(id);
  const dayKey = (ts=Date.now()) => {const d=new Date(ts);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
  const nextDay = n => {const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+Math.max(1,n));return d.getTime();};
  const saveJSON = (key, data) => {try {localStorage.setItem(key,JSON.stringify(data));return true;}catch(e){console.warn('Cannot save',e);return false;}};
  const readJSON = (key,fallback) => {try {const v=JSON.parse(localStorage.getItem(key));return v==null?fallback:v;}catch(e){return fallback;}};
  const copy = v => JSON.parse(JSON.stringify(v));
  const setText = (id,t) => {const e=$(id);if(e)e.textContent=String(t);};
  const setStat = (id,big,small) => {const e=$(id);if(!e)return;e.replaceChildren(document.createTextNode(String(big)),el('span','',small));};
  const toggle = (id,hide) => {const e=$(id);if(e)e.classList.toggle('hidden',!!hide);};
  const el = (tag,className,text) => {const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=String(text);return e;};
  const signedHash = s => {let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
  const shuffled = (words,seed) => words.slice().sort((a,b)=>signedHash(seed+a.id)-signedHash(seed+b.id));

  function modeModel() {return {passedDates:[],dueAt:0,intervalDays:0,streak:0,lastGrade:null,lastSuccessDate:'',lastPracticeDate:'',failedDate:'',lapses:0,ease:2.3};}
  function normalizeMode(x) {
    const m={...modeModel(),...(x&&typeof x==='object'?x:{})};
    if (!Array.isArray(m.passedDates))m.passedDates=[];
    m.passedDates=[...new Set(m.passedDates.filter(v=>typeof v==='string'))].slice(-50);
    return m;
  }
  function migrateOld() {
    const old=readJSON('por_vocab_v01_progress',{});
    const next={};
    if(old&&typeof old==='object'&&!Array.isArray(old))for(const [id,r] of Object.entries(old)) {
      if(!BY_ID.has(id)||!r||typeof r!=='object')continue;
      const dates=Array.isArray(r.successDates)?r.successDates.filter(v=>typeof v==='string'):[];
      const m=normalizeMode({passedDates:dates,dueAt:Number(r.nextDueAt)||0,intervalDays:Number(r.intervalDays)||1,streak:dates.length,lastGrade:r.lastGrade??null,lapses:Number(r.lapses)||0,lastSuccessDate:dates.at(-1)||''});
      next[id]={firstSeenDate:r.firstSeenDate||dates[0]||dayKey(),read:m,recall:null};
    }
    return next;
  }
  let progress=readJSON(KEY,null);
  let events=readJSON(EVENT_KEY,null);
  let cycles=readJSON(CYCLE_KEY,{});
  if(!progress||typeof progress!=='object'||Array.isArray(progress))progress=migrateOld();
  if(!Array.isArray(events))events=readJSON('por_vocab_v01_events',[]).map(e=>({...e,direction:'read'}));
  if(!cycles||typeof cycles!=='object'||Array.isArray(cycles))cycles={};
  function persist() {saveJSON(KEY,progress);saveJSON(EVENT_KEY,events.slice(-MAX_EVENT_LOG));saveJSON(CYCLE_KEY,cycles);}
  const getRec = w => progress[w.id]||null;
  function ensureRec(w){if(!progress[w.id])progress[w.id]={firstSeenDate:dayKey(),read:modeModel(),recall:null};return progress[w.id];}
  function readMode(rec,dir){return rec&&rec[dir]?normalizeMode(rec[dir]):null;}
  function recallUnlocked(rec){return !!(rec&&rec.read&&normalizeMode(rec.read).passedDates.length>=2);}
  function modeDue(rec,dir) {
    if(!rec)return false;
    if(dir==='recall'&&!recallUnlocked(rec))return false;
    const m=readMode(rec,dir);
    if(!m)return dir==='recall';
    return (!m.dueAt||m.dueAt<=Date.now()) && m.lastSuccessDate!==dayKey();
  }
  function statusOf(w){
    const r=getRec(w);if(!r)return 'new';
    const a=readMode(r,'read'),b=readMode(r,'recall');
    if(a&&b&&a.passedDates.length>=2&&b.passedDates.length>=4&&b.intervalDays>=14)return 'mastered';
    if((a&&a.passedDates.length>=2)||(b&&b.passedDates.length>=1))return 'familiar';
    return 'learning';
  }
  function dueCandidate(w){
    const r=getRec(w);if(!r)return null;
    const a=modeDue(r,'read'),b=modeDue(r,'recall');
    if(!a&&!b)return null;
    if(b&&(!a||!r.recall||Number(r.recall.dueAt)<=Number(r.read.dueAt)||Number(r.read.intervalDays)>=7))return {id:w.id,direction:'recall',isRetry:false};
    return {id:w.id,direction:'read',isRetry:false};
  }
  function dueCards(category='all'){
    return WORDS.filter(w=>category==='all'||w.category===category).map(w=>dueCandidate(w)).filter(Boolean).sort((a,b)=>{
      const x=progress[a.id]?.[a.direction]?.dueAt||0,y=progress[b.id]?.[b.direction]?.dueAt||0;return x-y;
    });
  }
  function newCandidates(category='all'){
    const words=WORDS.filter(w=>(category==='all'||w.category===category)&&!getRec(w));
    if(category!=='all')return shuffled(words,dayKey()+category).sort((a,b)=>(Number(a.level)||2)-(Number(b.level)||2));
    const basic=shuffled(words.filter(w=>(Number(w.level)||2)===1),dayKey()+'basic');
    const work=shuffled(words.filter(w=>(Number(w.level)||2)>1&&w.category==='仕事・ビジネス'),dayKey()+'work');
    const other=shuffled(words.filter(w=>(Number(w.level)||2)>1&&w.category!=='仕事・ビジネス'),dayKey()+'other');
    const out=[];
    while(basic.length||work.length||other.length){
      for(let i=0;i<7;i++)if(basic.length)out.push(basic.shift());
      for(let i=0;i<2;i++)if(work.length)out.push(work.shift());
      if(other.length)out.push(other.shift());
      if(!basic.length&&!work.length&&!other.length)break;
    }
    return out;
  }
  function introducedToday(){return Object.values(progress).filter(r=>r&&r.firstSeenDate===dayKey()).length;}
  function newBudget(nDue){const left=Math.max(0,NEW_PER_DAY-introducedToday());return nDue>24?0:nDue>12?Math.min(left,5):left;}
  function counts(){const c={new:0,learning:0,familiar:0,mastered:0};for(const w of WORDS)c[statusOf(w)]++;return c;}
  function getStreak(){const days=new Set(events.map(e=>e.date));const d=new Date();d.setHours(12,0,0,0);if(!days.has(dayKey(d.getTime())))d.setDate(d.getDate()-1);let n=0;for(let i=0;i<600;i++){if(!days.has(dayKey(d.getTime())))break;n++;d.setDate(d.getDate()-1);}return n;}
  function genderText(w){
    if(w.pos==='noun'){
      if(w.pluralOnly)return w.gender==='m'?'男性名詞・複数形 · os '+w.pt:'女性名詞・複数形 · as '+w.pt;
      return w.gender==='m'?'男性名詞 · o '+w.pt:w.gender==='f'?'女性名詞 · a '+w.pt:w.gender==='both'?'男性・女性共通名詞 · o/a '+w.pt:'名詞';
    }
    if(w.pos==='adjective'){
      const irregular={bom:'boa',mau:'má'};
      const fem=irregular[w.pt]||(w.pt.endsWith('o')?w.pt.slice(0,-1)+'a':w.pt);
      return `形容詞 · 男性 ${w.pt} / 女性 ${fem}`;
    }
    return POS[w.pos]||w.pos;
  }
  function sourceOf(w){return Array.isArray(w.sources)?w.sources.join(' / '):(w.source||'');}

  const irregular = {
    ser:{present:['sou','é','somos','são'],past:['fui','foi','fomos','foram'],imperfect:['era','era','éramos','eram']},
    estar:{present:['estou','está','estamos','estão'],past:['estive','esteve','estivemos','estiveram'],imperfect:['estava','estava','estávamos','estavam']},
    ter:{present:['tenho','tem','temos','têm'],past:['tive','teve','tivemos','tiveram'],imperfect:['tinha','tinha','tínhamos','tinham']},
    ir:{present:['vou','vai','vamos','vão'],past:['fui','foi','fomos','foram'],imperfect:['ia','ia','íamos','iam']},
    poder:{present:['posso','pode','podemos','podem'],past:['pude','pôde','pudemos','puderam'],imperfect:['podia','podia','podíamos','podiam']},
    querer:{present:['quero','quer','queremos','querem'],past:['quis','quis','quisemos','quiseram'],imperfect:['queria','queria','queríamos','queriam']},
    fazer:{present:['faço','faz','fazemos','fazem'],past:['fiz','fez','fizemos','fizeram'],imperfect:['fazia','fazia','fazíamos','faziam']},
    saber:{present:['sei','sabe','sabemos','sabem'],past:['soube','soube','soubemos','souberam'],imperfect:['sabia','sabia','sabíamos','sabiam']},
    ver:{present:['vejo','vê','vemos','veem'],past:['vi','viu','vimos','viram'],imperfect:['via','via','víamos','viam']},
    vir:{present:['venho','vem','vimos','vêm'],past:['vim','veio','viemos','vieram'],imperfect:['vinha','vinha','vínhamos','vinham']},
    dar:{present:['dou','dá','damos','dão'],past:['dei','deu','demos','deram'],imperfect:['dava','dava','dávamos','davam']},
    dizer:{present:['digo','diz','dizemos','dizem'],past:['disse','disse','dissemos','disseram'],imperfect:['dizia','dizia','dizíamos','diziam']},
    trazer:{present:['trago','traz','trazemos','trazem'],past:['trouxe','trouxe','trouxemos','trouxeram'],imperfect:['trazia','trazia','trazíamos','traziam']},
    manter:{present:['mantenho','mantém','mantemos','mantêm'],past:['mantive','manteve','mantivemos','mantiveram'],imperfect:['mantinha','mantinha','mantínhamos','mantinham']},
    reduzir:{present:['reduzo','reduz','reduzimos','reduzem'],past:['reduzi','reduziu','reduzimos','reduziram'],imperfect:['reduzia','reduzia','reduzíamos','reduziam']},
    descer:{present:['desço','desce','descemos','descem']},
    esquecer:{present:['esqueço','esquece','esquecemos','esquecem']},
    desaparecer:{present:['desapareço','desaparece','desaparecemos','desaparecem']},
    conseguir:{present:['consigo','consegue','conseguimos','conseguem']},
    conhecer:{present:['conheço','conhece','conhecemos','conhecem']},
    oferecer:{present:['ofereço','oferece','oferecemos','oferecem']},
    esclarecer:{present:['esclareço','esclarece','esclarecemos','esclarecem']},
    acontecer:{present:['aconteço','acontece','acontecemos','acontecem']},
    ouvir:{present:['ouço','ouve','ouvimos','ouvem']},
    sentir:{present:['sinto','sente','sentimos','sentem']},
    preferir:{present:['prefiro','prefere','preferimos','preferem']},
    dormir:{present:['durmo','dorme','dormimos','dormem']},
    medir:{present:['meço','mede','medimos','medem']},
    pedir:{present:['peço','pede','pedimos','pedem']},
    perder:{present:['perco','perde','perdemos','perdem']},
    sair:{present:['saio','sai','saímos','saem'],past:['saí','saiu','saímos','saíram'],imperfect:['saía','saía','saíamos','saíam']},
    cair:{present:['caio','cai','caímos','caem'],past:['caí','caiu','caímos','caíram'],imperfect:['caía','caía','caíamos','caíam']},
    ler:{present:['leio','lê','lemos','leem'],past:['li','leu','lemos','leram']},
    começar:{present:['começo','começa','começamos','começam'],past:['comecei','começou','começamos','começaram']},
    chegar:{past:['cheguei','chegou','chegamos','chegaram']},
    pagar:{past:['paguei','pagou','pagamos','pagaram']},
    ligar:{past:['liguei','ligou','ligamos','ligaram']},
    alugar:{past:['aluguei','alugou','alugamos','alugaram']},
    trocar:{past:['troquei','trocou','trocamos','trocaram']},
    ficar:{past:['fiquei','ficou','ficamos','ficaram']},
    colocar:{past:['coloquei','colocou','colocamos','colocaram']},
    procurar:{past:['procurei','procurou','procuramos','procuraram']},
    repetir:{present:['repito','repete','repetimos','repetem']},
    seguir:{present:['sigo','segue','seguimos','seguem']},
    descobrir:{present:['descubro','descobre','descobrimos','descobrem']},
    construir:{present:['construo','constrói','construímos','constroem']},
    decidir:{present:['decido','decide','decidimos','decidem']},
    dirigir:{present:['dirijo','dirige','dirigimos','dirigem']},
    atingir:{present:['atinjo','atinge','atingimos','atingem']},
    dividir:{present:['divido','divide','dividimos','dividem']}
  };
  function regularConj(v){
    const last=v.slice(-2),stem=v.slice(0,-2);
    if(!['ar','er','ir'].includes(last))return null;
    if(last==='ar'){
      let first=stem+'ei';
      if(stem.endsWith('c'))first=stem.slice(0,-1)+'quei';
      else if(stem.endsWith('g'))first=stem.slice(0,-1)+'guei';
      else if(stem.endsWith('ç'))first=stem.slice(0,-1)+'cei';
      return {present:[stem+'o',stem+'a',stem+'amos',stem+'am'],past:[first,stem+'ou',stem+'amos',stem+'aram'],imperfect:[stem+'ava',stem+'ava',stem+'ávamos',stem+'avam']};
    }
    if(last==='er')return {present:[stem+'o',stem+'e',stem+'emos',stem+'em'],past:[stem+'i',stem+'eu',stem+'emos',stem+'eram'],imperfect:[stem+'ia',stem+'ia',stem+'íamos',stem+'iam']};
    return {present:[stem+'o',stem+'e',stem+'imos',stem+'em'],past:[stem+'i',stem+'iu',stem+'imos',stem+'iram'],imperfect:[stem+'ia',stem+'ia',stem+'íamos',stem+'iam']};
  }
  function conjugations(w){if(w.pos!=='verb')return null;const v=w.pt.trim().toLowerCase();const regular=regularConj(v);const exceptions=irregular[v]||{};const fromData=w.conjugations||{};
    if(!regular&&!Object.keys(exceptions).length)return null;
    let base={...(regular||{}),...exceptions,...fromData};
    // A present-only irregular entry may have predictable past but non-standard first person; avoid asserting guessed forms.
    if(['conseguir','conhecer','oferecer','esclarecer','acontecer','ouvir','sentir','preferir','dormir','medir','pedir','perder','repetir','seguir','descobrir','construir','dirigir','atingir'].includes(v)){
      // Keep ordinary -er/-ir past only where the pattern is regular.
      if(['construir'].includes(v)){delete base.past;delete base.imperfect;}
    }
    if(['sair','cair','ler','ver','vir','ir','ser'].includes(v))base={...base};
    // For orthography changes, explicit past above overrides regular.
    return base;
  }
  function renderConjugation(container,w){container.replaceChildren();const forms=conjugations(w);if(!forms)return false;
    const labels={present:'現在形',past:'過去形（完了過去）',imperfect:'過去形（不完全過去）'};
    for(const key of ['present','past','imperfect']){
      const arr=forms[key];if(!Array.isArray(arr)||arr.length!==4)continue;
      const div=el('div','conj-row'),head=el('strong','',labels[key]),body=el('span','conj-forms',arr.map((v,i)=>['eu','você','nós','eles'][i]+' '+v).join(' / '));
      div.append(head,body);container.append(div);
    }
    return !!container.childElementCount;
  }

  let page='home';
  let session=null;
  let queue=[];
  let current=null;
  let revealed=false;
  let answerStartedAt=Date.now();
  let snapshots=[];
  let detailId=null;
  let dictShown=60;

  function saveSession(){saveJSON(SESSION_KEY,session?{session,queue,current,revealed,ts:Date.now()}:null);}
  function restoreSession(){const s=readJSON(SESSION_KEY,null);if(!s||!s.session||!Array.isArray(s.queue)||Date.now()-s.ts>16*3600*1000)return;
    if((s.current&&!BY_ID.has(s.current.id))||s.queue.some(c=>!BY_ID.has(c.id)))return;
    session=s.session;queue=s.queue;current=s.current;revealed=!!s.revealed;
  }
  restoreSession();
  function setPage(name){page=name;for(const n of ['home','study','dictionary'])toggle('page-'+n,n!==name);
    for(const btn of document.querySelectorAll('.tab'))btn.classList.toggle('active',btn.dataset.page===name);
    toggle('actionDock',name!=='study'||!current);
    if(name==='home')renderHome();if(name==='study')renderStudy();if(name==='dictionary')renderDictionary();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function getCycle(cat){if(!cycles[cat]||!Number(cycles[cat].round)||!Array.isArray(cycles[cat].seen))cycles[cat]={round:1,seen:[]};return cycles[cat];}
  function getRemainingCycle(cat){const c=getCycle(cat),seen=new Set(c.seen);return WORDS.filter(w=>w.category===cat&&!seen.has(w.id));}
  function weakCandidates(){const today=dayKey();return WORDS.filter(w=>{
    const r=getRec(w);if(!r||statusOf(w)==='mastered')return false;
    const m=readMode(r,'recall')||readMode(r,'read');
    return m&&m.lastSuccessDate!==today&&(m.lastGrade!==2||m.lapses>0||(!m.dueAt||m.dueAt<=Date.now()));
  }).sort((a,b)=>(progress[b.id]?.recall?.lapses||progress[b.id]?.read?.lapses||0)-(progress[a.id]?.recall?.lapses||progress[a.id]?.read?.lapses||0));}
  function bestDirection(w){const r=getRec(w);return r&&recallUnlocked(r)?'recall':'read';}
  function startLessonSession(lessonId){
    const lesson=LESSONS.find(x=>x.id===lessonId)||LESSONS[0];
    if(!lesson)return;
    const list=lesson.cards.map(card=>({id:card.id,direction:'lesson',isRetry:false}));
    session={mode:'lesson',cat:lesson.id,label:lesson.title,lessonId:lesson.id,initialTotal:list.length,completed:0,attempts:{},grades:[0,0,0],startedAt:Date.now()};
    queue=list;current=queue.shift()||null;revealed=false;answerStartedAt=Date.now();snapshots=[];saveSession();setPage('study');
  }
  function startSession(mode='today',cat='all',forceReset=true){
    if(mode==='today'&&!forceReset&&session&&current){setPage('study');return;}
    let list=[];
    const due=dueCards(cat);
    if(mode==='today'){
      list=due.slice(0,SESSION_REVIEW_MAX);
      const n=Math.min(newBudget(due.length),Math.max(0,SESSION_REVIEW_MAX-list.length));
      const fresh=newCandidates(cat).slice(0,n).map(w=>({id:w.id,direction:'read',isRetry:false}));
      if(list.length){for(const w of fresh)list.splice(Math.min(list.length,3+3*fresh.indexOf(w)),0,w);}else list=fresh;
    } else if(mode==='new'){
      list=newCandidates(cat).slice(0,Math.max(0,NEW_PER_DAY-introducedToday())).map(w=>({id:w.id,direction:'read',isRetry:false}));
    } else if(mode==='weak'){
      list=weakCandidates().slice(0,35).map(w=>({id:w.id,direction:bestDirection(w),isRetry:false}));
    } else if(mode==='category'){
      const c=getCycle(cat);
      list=shuffled(getRemainingCycle(cat),cat+'|'+c.round).slice(0,CATEGORY_SESSION_MAX).map(w=>({id:w.id,direction:bestDirection(w),isRetry:false}));
    }
    const label=mode==='today'?'今日の学習':mode==='new'?'新しい単語':mode==='weak'?'苦手語彙':cat;
    session={mode,cat,label,initialTotal:list.length,completed:0,attempts:{},grades:[0,0,0],startedAt:Date.now()};
    queue=list;current=queue.shift()||null;revealed=false;answerStartedAt=Date.now();snapshots=[];saveSession();setPage('study');
  }
  function showAnswer(){if(!current||revealed)return;revealed=true;renderStudy();saveSession();}
  function estimateTime(){return Math.max(1,Math.min(180,Math.round((Date.now()-answerStartedAt)/1000)));}
  function markGrade(card,grade,isRetry){
    const w=BY_ID.get(card.id),rec=ensureRec(w),today=dayKey();
    const m=normalizeMode(rec[card.direction]);
    let extraRepeat=false;
    const oldPass=m.passedDates.length;
    if(grade===2){
      if(!isRetry&&m.failedDate!==today&&!m.passedDates.includes(today)){
        m.passedDates.push(today);m.streak++;
        const stages=[1,3,7,14,30,60,120];
        const base=stages[Math.min(m.streak-1,stages.length-1)];
        m.intervalDays=Math.max(1,Math.round(base*Math.max(.8,Math.min(1.25,(m.ease||2.3)/2.3))));
      }else if(!m.intervalDays)m.intervalDays=1;
      m.lastSuccessDate=today;
      m.dueAt=nextDay(Math.max(1,m.intervalDays));
      m.ease=Math.min(2.7,(m.ease||2.3)+.04);
      if(!isRetry&&oldPass===0&&session.mode!=='category')extraRepeat=true;
      if(card.direction==='recall'&&rec.read&&rec.read.dueAt<=Date.now()){
        // Production recall implies recognition: prevent same-word double review immediately.
        rec.read.dueAt=nextDay(Math.max(3,Number(rec.read.intervalDays)||3));
      }
    }else{
      m.streak=0;m.intervalDays=1;m.dueAt=nextDay(1);m.failedDate=today;
      if(grade===0){m.lapses++;m.ease=Math.max(1.65,(m.ease||2.3)-.21);}
      else m.ease=Math.max(1.75,(m.ease||2.3)-.1);
      if(!isRetry&&session.mode!=='category')extraRepeat=true;
    }
    m.lastGrade=grade;m.lastPracticeDate=today;
    rec[card.direction]=m;rec.lastTouchedDate=today;
    return extraRepeat;
  }
  function gradeCard(score){if(!current||!revealed||!session)return;
    const card=current;
    if(session.mode==='lesson'){
      snapshots.push({card:copy(card),queue:copy(queue),prevSession:copy(session),eventLength:events.length});
      events.push({id:card.id,date:dayKey(),timestamp:Date.now(),grade:score,direction:'lesson',seconds:estimateTime(),mode:'lesson'});
      if(events.length>MAX_EVENT_LOG)events=events.slice(-MAX_EVENT_LOG);
      session.completed++;session.grades[score]++;session.attempts[card.id]=(session.attempts[card.id]||0)+1;
      if((score===0||score===1)&&!card.isRetry)queue.splice(Math.min(queue.length,4),0,{id:card.id,direction:'lesson',isRetry:true});
      current=queue.shift()||null;revealed=false;answerStartedAt=Date.now();persist();saveSession();renderStudy();return;
    }
    const w=BY_ID.get(card.id);
    snapshots.push({card:copy(card),oldRec:progress[w.id]?copy(progress[w.id]):null,oldCycles:session.mode==='category'?copy(getCycle(session.cat)):null,queue:copy(queue),prevSession:copy(session),eventLength:events.length});
    if(snapshots.length>15)snapshots.shift();
    const needRepeat=markGrade(card,score,!!card.isRetry);
    if(session.mode==='category'&&!card.isRetry){const c=getCycle(session.cat);if(!c.seen.includes(card.id))c.seen.push(card.id);}
    events.push({id:card.id,date:dayKey(),timestamp:Date.now(),grade:score,direction:card.direction,seconds:estimateTime(),mode:session.mode});
    if(events.length>MAX_EVENT_LOG)events=events.slice(-MAX_EVENT_LOG);
    session.completed++;session.grades[score]++;session.attempts[card.id]=(session.attempts[card.id]||0)+1;
    if(needRepeat&&!queue.some(c=>c.id===card.id)){
      const offset=Math.min(queue.length,score===0?5:8);
      queue.splice(offset,0,{id:card.id,direction:card.direction,isRetry:true});
    }
    current=queue.shift()||null;revealed=false;answerStartedAt=Date.now();persist();saveSession();renderStudy();
  }
  function undo(){if(!snapshots.length||!session)return;const s=snapshots.pop();
    if(session.mode==='lesson'){events=events.slice(0,s.eventLength);queue=s.queue;current=s.card;session=s.prevSession;revealed=true;answerStartedAt=Date.now();persist();saveSession();renderStudy();return;}
    const id=s.card.id;
    if(s.oldRec)progress[id]=s.oldRec;else delete progress[id];
    if(s.oldCycles)cycles[session.cat]=s.oldCycles;
    events=events.slice(0,s.eventLength);queue=s.queue;current=s.card;session=s.prevSession;revealed=true;answerStartedAt=Date.now();persist();saveSession();renderStudy();
  }
  function renderHome(){const c=counts(),due=dueCards().length;
    setStat('statMastered',c.mastered,` / ${WORDS.length}語`);setStat('statDue',due,'語');setStat('statLearning',c.learning+c.familiar,'語');
    const week=lastWeek();const n=week.reduce((a,b)=>a+b.count,0),minutes=Math.floor(week.reduce((a,b)=>a+b.seconds,0)/60);
    setStat('statWeek',n,`問 / ${minutes}分`);setText('streakBadge',`${getStreak()}日継続`);setText('totalWords',`全${WORDS.length}語`);
    for(const key of ['mastered','familiar','learning','new'])setText('count'+key[0].toUpperCase()+key.slice(1),c[key]);
    for(const key of ['mastered','familiar','learning'])$('bar'+key[0].toUpperCase()+key.slice(1)).style.width=(WORDS.length?100*c[key]/WORDS.length:0)+'%';
    const budget=newBudget(due);
    setText('planSummary',`復習 ${due}語 ・ 新しい語彙 最大${budget}語（1日上限${NEW_PER_DAY}語）`);
    setText('startToday',session&&current?'学習を続ける →':'今日の学習を始める →');
    const lessonId=$('lessonSelect')?.value;
    const lesson=LESSONS.find(x=>x.id===lessonId)||LESSONS[0];
    setText('lessonTitle','授業復習');
    setText('lessonSubtitle',lesson?.subtitle||'授業内容を復習');
    setText('lessonCount',lesson?`${lesson.cards.length}問`:'');
    setText('lessonSummary',lesson?`${lesson.title}：繰り返し練習した文法・表現を集中的に復習します。`:'授業復習はありません。');
    $('startLesson').disabled=!lesson;
    renderWeek(week);renderCategories();
  }
  function lastWeek(){const a=[];const cur=new Date();cur.setHours(12,0,0,0);for(let i=6;i>=0;i--){const d=new Date(cur);d.setDate(cur.getDate()-i);const key=dayKey(d.getTime()),es=events.filter(e=>e.date===key);a.push({key,short:`${d.getMonth()+1}/${d.getDate()}`,count:es.length,seconds:es.reduce((s,e)=>s+(Number(e.seconds)||0),0)});}return a;}
  function renderWeek(items){const box=$('weekGrid');box.replaceChildren();const today=dayKey();for(const item of items){const d=el('div','day-cell'+(today===item.key?' today':''));d.append(el('span','day-label',item.short),el('strong','day-count',item.count+'問'),el('span','day-time',Math.floor(item.seconds/60)+'分'));box.append(d);}}
  function renderCategories(){const wrap=$('categoryGrid');wrap.replaceChildren();const cat={};for(const w of WORDS)cat[w.category]=(cat[w.category]||0)+1;
    for(const [name,n] of Object.entries(cat)){
      const button=el('button','category');button.type='button';const cycle=getCycle(name);const done=Math.min(n,cycle.seen.length);
      const display=name==='IT・テクノロジー'?'IT・技術':name;
      button.append(el('span','',`${CAT_ICON[name]||'•'}  ${display}`),el('small','',`${done}/${n}語`));
      button.title=`${cycle.round}周目 ・ ${n-done}語残り`;
      button.addEventListener('click',()=>startSession('category',name));wrap.append(button);
    }
    const select=$('dictCategory');if(select.options.length===1)for(const catName of Object.keys(cat)){const option=document.createElement('option');option.value=catName;option.textContent=catName;select.append(option);}
  }
  function renderStudy(){if(page!=='study')return;
    if(!session){toggle('studyCard',true);toggle('actionDock',true);toggle('studyFinished',false);setText('finishTitle','まだ学習を開始していません');setText('finishSummary','ホームの「今日の学習を始める」を押してください。');toggle('finishMore',true);return;}
    const finished=!current;toggle('studyCard',finished);toggle('actionDock',finished);toggle('studyFinished',!finished);toggle('studyHint',finished);
    setText('studyMode',session.label);
    if(finished){
      const c=session.grades||[0,0,0];const total=session.completed||0;
      let msg=total?`${total}回学習 ・ 覚えた ${c[2]}回 / あやふや ${c[1]}回 / 知らない ${c[0]}回`:'現在の条件で出題できる語彙がありません。';
      let title='今回の学習は完了です';toggle('finishMore',session.mode!=='category'&&session.mode!=='lesson');
      if(session.mode==='lesson'){msg+='\n授業復習を完了しました。知らない・あやふやの問題は同じセッション内で再出題されました。';}
      else if(session.mode==='category'){
        const cycle=getCycle(session.cat),left=getRemainingCycle(session.cat).length;
        if(left===0){title=`${session.cat}：${cycle.round}周目を完了！`;msg+=`\nこのカテゴリの全${cycle.seen.length}語を一巡しました。次の周回を手動で始められます。`;setText('finishMore','次の周回へ');}
        else{msg+=`\n残り ${left}語でこのカテゴリを一巡します。`;setText('finishMore','同じカテゴリを続ける');}
        toggle('finishMore',false);
      }
      setText('finishTitle',title);setText('finishSummary',msg);setText('studyCounter',`${total}回`);$('studyProgressFill').style.width='100%';return;
    }
    if(session.mode==='lesson'){
      const lesson=LESSONS.find(x=>x.id===session.lessonId);
      const item=lesson?.cards.find(x=>x.id===current.id);
      if(!item){current=queue.shift()||null;renderStudy();return;}
      setText('studyCategory','授業復習'+(current.isRetry?' · もう一度':''));
      setText('studyDirection',item.type==='fill'?'穴埋め':'翻訳');
      setText('studyInstruction',item.instruction||'答えてください');
      setText('studyPrompt',item.prompt);
      setText('answerMain',item.answer);
      setText('answerMeta','');
      const add=$('answerAdditional');add.replaceChildren();
      if(item.note)add.append(el('span','',item.note));
      toggle('answerAdditional',!add.childElementCount);
      toggle('answerCollocations',true);toggle('answerConjugations',true);toggle('answerExample',true);
      setText('answerSource',`出典：${lesson?.source||lesson?.title||'授業資料'}`);
      toggle('studyAnswer',!revealed);toggle('revealBtn',revealed);toggle('ratingButtons',!revealed);
      $('sayWord').disabled=true;
      $('previousBtn').disabled=!snapshots.length;
      setText('dockTip',revealed?'自己評価して次へ':'頭の中で答える');
      const done=session.completed,remain=queue.length+1;
      setText('studyCounter',`${done+1} / ${done+remain}`);
      $('studyProgressFill').style.width=(100*done/Math.max(1,done+remain))+'%';
      return;
    }
    const w=BY_ID.get(current.id);if(!w){current=queue.shift()||null;renderStudy();return;}
    const recall=current.direction==='recall';
    setText('studyCategory',w.category+(current.isRetry?' · もう一度':''));
    setText('studyDirection',recall?'日 → 葡':'葡 → 日');
    setText('studyInstruction',recall?'ポルトガル語を思い出してください':'日本語の意味を思い出してください');
    setText('studyPrompt',recall?w.meanings.join('、'):w.pt);
    setText('answerMain',recall?w.pt:w.meanings.join('、'));
    setText('answerMeta',genderText(w));
    const add=$('answerAdditional');add.replaceChildren();
    if(w.pos==='noun'&&w.pluralOnly)add.append(el('span','',`通常は複数形で使う名詞です。`));
    toggle('answerAdditional',!add.childElementCount);
    const coll=$('collocationList');coll.replaceChildren();for(const text of (w.collocations||[]).filter(x=>!x.startsWith('現在形：')).slice(0,5))coll.append(el('span','chip',text));
    toggle('answerCollocations',!coll.childElementCount);
    toggle('answerConjugations',!renderConjugation($('conjugationBody'),w));
    const conjDetails=$('answerConjugations').querySelector('details');if(conjDetails)conjDetails.open=false;
    setText('examplePt',w.examplePt||'');setText('exampleJa',w.exampleJa||'');toggle('answerExample',!w.examplePt);
    setText('answerSource',sourceOf(w)?'出典：'+sourceOf(w):'');
    toggle('studyAnswer',!revealed);toggle('revealBtn',revealed);toggle('ratingButtons',!revealed);
    $('sayWord').disabled=!revealed&&recall;
    $('sayWord').title=(!revealed&&recall)?'答えを表示すると再生できます':'ポルトガル語の発音';
    $('previousBtn').disabled=!snapshots.length;
    setText('dockTip',revealed?'自己評価して次へ':'頭の中で答える');
    const done=session.completed||0,remain=queue.length+1;
    setText('studyCounter',`${done+1} / ${done+remain}`);
    $('studyProgressFill').style.width=(100*done/Math.max(1,done+remain))+'%';
  }
  function continueCategory(){if(!session||session.mode!=='category')return;const cat=session.cat;
    if(!getRemainingCycle(cat).length){const c=getCycle(cat);c.round++;c.seen=[];persist();}
    startSession('category',cat);
  }
  function say(pt){if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){alert('このブラウザでは読み上げを利用できません。');return;}
    try{window.speechSynthesis.cancel();const msg=new SpeechSynthesisUtterance(pt);msg.lang='pt-BR';msg.rate=.88;window.speechSynthesis.speak(msg);}catch(e){alert('読み上げを開始できませんでした。');}
  }
  function renderDictionary(){if(page!=='dictionary')return;
    const query=$('dictSearch').value.trim().toLocaleLowerCase('pt-BR');const cat=$('dictCategory').value,stage=$('dictStage').value;
    const results=WORDS.filter(w=>(cat==='all'||w.category===cat)&&(stage==='all'||statusOf(w)===stage)&&(!query||[w.pt,...w.meanings,...(w.collocations||[])].join(' ').toLocaleLowerCase('pt-BR').includes(query)));
    results.sort((a,b)=>a.pt.localeCompare(b.pt,'pt-BR'));
    setText('dictCount',`${results.length}語（全${WORDS.length}語）`);const wrap=$('dictResults');wrap.replaceChildren();
    for(const w of results.slice(0,dictShown)){
      const button=el('button','word-row');button.type='button';const left=el('div');left.append(el('strong','',w.pt),el('p','',w.meanings.join('、')+' · '+genderText(w)));
      button.append(left,el('span','word-state '+statusOf(w),STATUS[statusOf(w)]));button.addEventListener('click',()=>openDetail(w.id));wrap.append(button);
    }
    toggle('dictMore',results.length<=dictShown);if(!results.length)wrap.append(el('p','muted','該当する語彙はありません。'));
  }
  function openDetail(id){const w=BY_ID.get(id);if(!w)return;detailId=id;const dlg=$('detailDialog'),body=$('detailBody');body.replaceChildren();
    body.append(el('h2','',w.pt),el('p','detail-meanings',w.meanings.join('、')),el('p','detail-meta',`${genderText(w)} ・ ${w.category} ・ ${STATUS[statusOf(w)]}`));
    if(w.collocations?.length){body.append(el('h3','detail-title','よく使う形・関連表現'));const chips=el('div','chips');for(const x of w.collocations.slice(0,10))chips.append(el('span','chip',x));body.append(chips);}
    if(w.pos==='verb'){const wrap=el('div');if(renderConjugation(wrap,w)){body.append(el('h3','detail-title','活用（eu / você / nós / eles）'));body.append(wrap);}}
    if(w.examplePt){body.append(el('h3','detail-title','例文'),el('p','example-pt',w.examplePt),el('p','example-ja',w.exampleJa||''));}
    body.append(el('p','answer-source',sourceOf(w)?'出典：'+sourceOf(w):''));
    const snd=el('button','primary-btn','🔊 発音を聞く');snd.addEventListener('click',()=>say(w.pt));body.append(snd);
    if(!dlg.open)dlg.showModal();
  }
  function exportProgress(){const data={app:'meu-vocabulario',schema:2,exportedAt:new Date().toISOString(),progress,events,cycles};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`meu-vocabulario-backup-${dayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function importProgress(file){if(!file)return;
    try{if(file.size>12*1024*1024)throw Error('ファイルが大きすぎます。');const content=JSON.parse(await file.text());
      if(content.app!=='meu-vocabulario'||content.schema!==2||!content.progress||!Array.isArray(content.events)||!content.cycles)throw Error('このアプリのバックアップではありません。');
      if(!confirm('現在の学習履歴をバックアップファイルの内容で置き換えます。よろしいですか？'))return;
      const valid={};for(const [id,r] of Object.entries(content.progress))if(BY_ID.has(id)&&r&&typeof r==='object')valid[id]=r;
      progress=valid;events=content.events.slice(-MAX_EVENT_LOG);cycles=content.cycles;session=null;current=null;queue=[];snapshots=[];persist();saveSession();renderHome();setText('importStatus','学習履歴を復元しました。');
    }catch(e){setText('importStatus','読み込みできませんでした：'+e.message);}finally{$('importFile').value='';}
  }
  function init(){
    if(!WORDS.length){setText('planSummary','語彙データを読み込めません。vocabulary.js の配置を確認してください。');$('startToday').disabled=true;return;}
    const ids=WORDS.map(w=>w.id);if(new Set(ids).size!==ids.length)console.error('語彙ID重複');
    document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{
      if(b.dataset.page==='study'&&!session)startSession('today');else setPage(b.dataset.page);
    }));
    $('startToday').addEventListener('click',()=>startSession('today','all',false));
    $('startNew').addEventListener('click',()=>startSession('new'));
    $('startWeak').addEventListener('click',()=>startSession('weak'));
    const lessonSelect=$('lessonSelect');
    if(lessonSelect){
      lessonSelect.replaceChildren();
      for(const lesson of LESSONS){const option=el('option','',`${lesson.title}（${lesson.cards.length}問）`);option.value=lesson.id;lessonSelect.append(option);}
      lessonSelect.addEventListener('change',renderHome);
    }
    $('startLesson').addEventListener('click',()=>startLessonSession($('lessonSelect')?.value||LESSONS[0]?.id));
    $('studyBack').addEventListener('click',()=>setPage('home'));
    $('finishHome').addEventListener('click',()=>setPage('home'));
    $('finishMore').addEventListener('click',continueCategory);
    $('revealBtn').addEventListener('click',showAnswer);
    $('previousBtn').addEventListener('click',undo);
    $('sayWord').addEventListener('click',()=>{if(!current)return;const w=BY_ID.get(current.id);if(w&&(!(!revealed&&current.direction==='recall')))say(w.pt);});
    document.querySelectorAll('[data-grade]').forEach(b=>b.addEventListener('click',()=>gradeCard(Number(b.dataset.grade))));
    for(const key of ['dictSearch','dictCategory','dictStage'])$(key).addEventListener(key==='dictSearch'?'input':'change',()=>{dictShown=60;renderDictionary();});
    $('dictMore').addEventListener('click',()=>{dictShown+=60;renderDictionary();});
    $('detailClose').addEventListener('click',()=>$('detailDialog').close());
    $('detailDialog').addEventListener('click',e=>{if(e.target===$('detailDialog'))$('detailDialog').close();});
    $('exportData').addEventListener('click',exportProgress);
    $('importTrigger').addEventListener('click',()=>$('importFile').click());
    $('importFile').addEventListener('change',e=>importProgress(e.target.files[0]));
    renderHome();
  }
  init();
})();
