(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const lists=[...document.querySelectorAll('.chat-log-list')];
  const filters=[...document.querySelectorAll('.chat-log-filter')];
  let activeFilter='all';
  const recent=new Map();
  const entries=[];
  const maxStored=6000,maxVisible=350;
  let checked=0,readable=0,total=0,flagged=0;
  const time=seconds=>{
    const s=Math.max(0,Math.floor(Number(seconds)||0));
    return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s%3600/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  };
  const normalized=s=>String(s).normalize('NFKC').toLowerCase()
    .replace(/\s+/g,'').replace(/[^\p{L}\p{N}]/gu,'').slice(0,160);
  const linesFrom=raw=>String(raw??'').replace(/\u0000/g,'')
    .split(/\r?\n/).map(s=>s.replace(/\s+/g,' ').trim())
    .filter(s=>s.length>=2&&/[\p{L}]/u.test(s)).slice(0,35);
  function shown(entry){return activeFilter!=='flagged'||entry.flagged;}
  function createRow(entry){
    const row=document.createElement('div');
    row.className='chat-log-row'+(entry.flagged?' chat-log-flagged':'');
    row.setAttribute('role','listitem');
    const timeBtn=document.createElement('button');
    timeBtn.type='button';timeBtn.className='chat-log-time';timeBtn.textContent=time(entry.at);
    timeBtn.title='영상의 해당 시간으로 이동';
    timeBtn.addEventListener('click',()=>window.PlayCheckBridge?.seekTo?.(entry.at));
    const body=document.createElement('div');body.className='chat-log-message';
    const line=document.createElement('p');line.textContent=entry.text;
    const detail=document.createElement('small');
    detail.textContent=(entry.flagged?'⚠ '+entry.labels.join(', ')+' · ':'')+entry.source+' · 영상 화면 OCR';
    body.append(line,detail);row.append(timeBtn,body);
    return row;
  }
  function appendRow(entry){
    if(!shown(entry))return;
    for(const list of lists){
      const follow=list.scrollHeight-list.scrollTop-list.clientHeight<75;
      list.append(createRow(entry));
      while(list.children.length>maxVisible)list.firstElementChild?.remove();
      if(follow)list.scrollTop=list.scrollHeight;
    }
  }
  function repaint(){
    for(const list of lists){
      list.replaceChildren();
      for(const item of entries.filter(shown).slice(-maxVisible))list.append(createRow(item));
      list.scrollTop=list.scrollHeight;
    }
  }
  function update(){
    for(const count of document.querySelectorAll('.chat-log-count'))count.textContent=String(total);
    for(const warnings of document.querySelectorAll('.chat-log-flagged-count'))warnings.textContent=String(flagged);
    const status=checked===0?'영상을 열고 재생하거나 분석을 시작하세요.':
      '확인한 화면 '+checked+'개 · 글자 인식 화면 '+readable+'개 · 채팅 로그 '+total+'줄'+
      (total===0?' · OCR이 글자를 읽지 못했거나 채팅이 화면에 없었습니다.':'');
    for(const state of document.querySelectorAll('.chat-log-status'))state.textContent=status;
  }
  function appendFrame(raw,at,source='영상 OCR'){
    checked++;
    const lines=linesFrom(raw);
    if(lines.length)readable++;
    const seconds=Math.max(0,Number(at)||0);
    let added=0;
    for(const original of lines){
      const key=normalized(original);
      if(key.length<2)continue;
      const last=recent.get(key);
      // The same on-screen message persists across many sampled frames.
      if(last!==undefined&&Math.abs(last-seconds)<12)continue;
      recent.set(key,seconds);
      const candidates=window.PlayCheckHeuristics?.extractOCRCandidates?.(original)||[];
      const labels=[...new Set(candidates.flatMap(c=>c.labels||[]))];
      const entry={at:seconds,text:original.slice(0,500),source:String(source),flagged:labels.length>0,labels};
      entries.push(entry);if(entries.length>maxStored)entries.shift();
      total++;if(entry.flagged)flagged++;
      appendRow(entry);added++;
    }
    if(recent.size>2500){
      for(const [key,stamp] of recent)if(Math.abs(seconds-stamp)>35)recent.delete(key);
    }
    update();
    return added;
  }
  function clear(){
    entries.length=0;recent.clear();checked=0;readable=0;total=0;flagged=0;
    for(const list of lists)list.replaceChildren();update();
  }
  function exportLog(){
    if(!total){window.PlayCheckBridge?.notify?.('저장할 채팅 로그가 없습니다.',true);return;}
    const lines=[
      '# LoL 트롤링 판독기 | 영상 OCR 채팅 로그',
      '# 화면에서 OCR로 읽은 글자입니다. 실제 플레이어 채팅과 다를 수 있으므로 원본 영상 확인이 필요합니다.',
      '# 저장된 '+entries.length+'줄 / 총 '+total+'줄 (최근 6000줄까지 보관)',
      '',
      ...entries.map(e=>time(e.at)+' | '+(e.flagged?'[확인 필요: '+e.labels.join(', ')+'] ':'')+'['+e.source+'] '+e.text)
    ];
    window.PlayCheckBridge?.download?.('lol_video_chat_log.txt',lines.join('\n'),'text/plain;charset=utf-8');
  }
  for(const filter of filters)filter.addEventListener('change',()=>{activeFilter=filter.value;for(const other of filters)other.value=activeFilter;repaint();});
  for(const clearBtn of document.querySelectorAll('.chat-log-clear'))clearBtn.addEventListener('click',clear);
  for(const exportBtn of document.querySelectorAll('.chat-log-export'))exportBtn.addEventListener('click',exportLog);
  $('#videoFile')?.addEventListener('change',()=>clear());
  window.PlayCheckChatLog={appendFrame,clear,snapshot:()=>entries.map(e=>({...e,labels:[...e.labels]})),stats:()=>({checked,readable,total,flagged})};
  update();
})();