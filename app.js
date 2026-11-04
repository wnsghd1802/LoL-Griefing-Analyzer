(() => {
  'use strict';
  const $ = (q) => document.querySelector(q);
  const $$ = (q) => Array.from(document.querySelectorAll(q));
  const paperTerms = ['idiot','stupid','noob','trash','retard','fuck','fuk','moron','ez','feeder','afk','uninstall','useless','loser'];
  const koPatterns = [
    {name:'행동 포기 선언 후보',re:/(?:오픈\s*(?:함|할게|한다|하자|해|할거|하겠)|나\s*안\s*해|겜\s*안\s*함|게임\s*안\s*함|게임\s*포기|던진다|던짐|일부러\s*죽|고의로\s*죽)/i},
    {name:'공격적 표현 후보',re:/(?:씨발|시발|ㅅㅂ|병신|ㅂㅅ|개새끼|닥쳐|꺼져)/i}
  ];
  const state = { intervals:[], source:'', participant:'2', chat:[], events:[], videoUrl:null, ocrWorker:null, busy:false, sourceType:'none' };
  const sampleIncrements = {4:2,5:1,6:4,7:6,8:1,10:2,11:7,14:2,15:4,18:3,19:5,20:1};
  const sampleChat = [
    '14:55  [가상 예시] 항복 투표가 부결됐네',
    '15:12  [가상 예시] 오픈함',
    '16:20  [가상 예시] 일단 넥서스 막자',
    '18:04  [가상 예시] 신고할게',
    '20:21  [가상 예시] trash',
    '21:00  [가상 예시] 다음 용 같이 가자'
  ].join('\n');
  function notify(msg, error=false){ const el=$('#feedback');el.hidden=false;el.textContent=msg;el.className='feedback'+(error?' error':'');}
  function esc(s){return String(s??'').replace(/[&<>"']/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function timeFmt(sec){sec=Math.max(0,Math.floor(Number(sec)||0));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return(h?`${h}:`:'')+`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
  function asSeconds(st){ if(!st)return null;let p=st.split(':').map(Number);if(p.some(n=>!Number.isFinite(n)))return null;if(p.length===2)return p[0]*60+p[1];if(p.length===3)return p[0]*3600+p[1]*60+p[2];return null; }
  function tab(name){$$('[role="tab"]').forEach(b=>{let on=b.dataset.tab===name;b.classList.toggle('selected',on);b.setAttribute('aria-selected',String(on));});$$('[data-panel]').forEach(p=>{let on=p.dataset.panel===name;p.hidden=!on;p.classList.toggle('visible',on);});$('#workspace').scrollIntoView({block:'start',behavior:'smooth'}); if(name==='report')renderReport();}
  $$('[role="tab"]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
  $('#goVideo').addEventListener('click',()=>{tab('video'); $('#videoFile').click();});
  $('#startDemo').addEventListener('click',()=>{demoCS();$('#chatInput').value=sampleChat;analyzeChat();if(window.EvidenceCommon)window.EvidenceCommon.loadDemo();tab('auto');$('#autoDemoBtn').click();notify('여러 행동 유형의 가상 자동 탐색 결과를 불러왔습니다. 실제 사건 분석 결과는 아닙니다.');});
  function setParticipants(ids){const el=$('#participant');const previously=el.value;el.innerHTML=ids.map(i=>`<option value="${Number(i)}">${Number(i)}</option>`).join('');el.value=ids.includes(Number(previously))?previously:(ids.includes(2)?'2':String(ids[0]));}
  function demoCS(){ const frames=[];let cs=0;for(let m=0;m<=23;m++){if(m>0)cs+=sampleIncrements[m-1]||0;frames.push({timestamp:m*60000,participantFrames:{'2':{participantId:2,minionsKilled:cs,jungleMinionsKilled:35}}});} setParticipants([2]);state.sourceType='demo'; state.source='가상 CS 패턴 예시 (실제 경기의 판정 결과 아님)'; parseRiotFrames(frames); }
  function parseRiotFrames(frames){const id=$('#participant').value;let prev=null,intervals=[];for(const f of frames){const p=f.participantFrames?.[id]??Object.values(f.participantFrames??{}).find(z=>String(z?.participantId)===id);const ts=Number(f.timestamp);const cs=Number(p?.minionsKilled);if(!p||!Number.isFinite(cs)||!Number.isFinite(ts))continue;
      if(prev && ts>prev.ts){const minutes=(ts-prev.ts)/60000;const delta=cs-prev.cs;if(delta>=0 && minutes>0 && minutes<=60){intervals.push({start:prev.ts/1000,end:ts/1000,delta,minutes,rate:delta/minutes,jungleDelta:Number.isFinite(Number(p.jungleMinionsKilled))&&Number.isFinite(Number(prev.jg))?Math.max(0,Number(p.jungleMinionsKilled)-Number(prev.jg)):null});}}
      prev={ts,cs,jg:p.jungleMinionsKilled}; }
    if(intervals.length===0)throw Error('선택한 참가자의 유효한 CS 구간을 찾지 못했습니다.');state.intervals=intervals;state.participant=id;renderCS();renderReport(); }
  function parseSeries(data){const raw=data.intervals;if(!Array.isArray(raw)||!raw.length)throw Error('예시 데이터에 CS 구간이 없습니다.');state.intervals=raw.map(r=>{let start=Number(r.start),end=Number(r.end),delta=Number(r.cs);if(![start,end,delta].every(Number.isFinite)||start<0||end<=start||delta<0)throw Error('CS 구간 형식이 올바르지 않습니다.');return {start:start*60,end:end*60,delta,minutes:end-start,rate:delta/(end-start),jungleDelta:null};});state.participant=String(data.participantId??2);state.source=data.note||'사용자 제공 CS 구간 데이터';state.sourceType='series';setParticipants([Number(state.participant)]);renderCS();renderReport();}
  $('#csDemo').addEventListener('click',()=>{try{demoCS();notify('가상 CS 증가량 예시를 불러왔습니다. 특정 플레이어의 고의성을 판단한 결과가 아닙니다.');}catch(e){notify(e.message,true);}});
  $('#timelineFile').addEventListener('change',async(e)=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>80*1024*1024)throw Error('이 브라우저 버전은 80MB 이하의 JSON만 지원합니다.');const data=JSON.parse(await file.text());if(Array.isArray(data.info?.frames)){const ids=Object.keys(data.info.frames.find(x=>x.participantFrames)?.participantFrames??{}).map(Number).filter(Number.isFinite);if(!ids.length)throw Error('participantFrames에서 참가자 ID를 찾지 못했습니다.');setParticipants(ids);state.rawFrames=data.info.frames;state.sourceType='riot';state.source=`Riot 타임라인 · ${file.name} · ${data.metadata?.matchId??'경기 ID 미기재'}`;parseRiotFrames(state.rawFrames);}else if(data.format==='cs-series'){state.rawFrames=null;parseSeries(data);}else throw Error('지원되지 않는 JSON입니다. Riot Match-V5 타임라인 또는 sample_data의 cs-series가 필요합니다.');notify(`불러오기 성공: ${file.name}`);}catch(err){notify(err.message,true);}finally{e.target.value='';}});
  $('#participant').addEventListener('change',()=>{if(state.sourceType==='riot'&&state.rawFrames){try{parseRiotFrames(state.rawFrames);}catch(e){notify(e.message,true);}}});
  $('#csThreshold').addEventListener('input',renderCS);
  function csThreshold(){const n=Number($('#csThreshold').value);return Number.isFinite(n)?Math.max(0,n):4;}
  function renderCS(){const arr=state.intervals;$('#csSource').textContent=state.source||'아직 선택된 데이터가 없습니다.';if(!arr.length){$('#csChart').className='chart-placeholder';$('#csChart').textContent='타임라인 데이터를 불러오면 그래프가 나타납니다.';return;}
    const sum=arr.reduce((a,x)=>a+x.delta,0),peak=Math.max(...arr.map(x=>x.rate)),flags=arr.filter(x=>x.rate>csThreshold()).length;
    $('#totalCs').textContent=`${sum}개`;$('#peakCs').textContent=`${peak.toFixed(1)}개/분`;$('#csFlags').textContent=`${flags}구간`;
    const max=Math.max(6,peak,csThreshold()+1);const html=arr.map(x=>{const height=Math.round(190*x.rate/max);const hot=x.rate>csThreshold();return `<div class="bar-slot"><span class="bar-value">${x.delta||''}</span><button type="button" data-seek="${x.start}" aria-label="${timeFmt(x.start)}~${timeFmt(x.end)}: ${x.delta}개, ${x.rate.toFixed(2)}개/분" title="${timeFmt(x.start)}–${timeFmt(x.end)} · ${x.delta}개 / ${x.rate.toFixed(2)}개/분" class="${hot?'hot':''}" style="height:${Math.max(height,2)}px"></button><span class="bar-label">${timeFmt(x.start)}</span></div>`}).join('');$('#csChart').className='cs-bars';$('#csChart').style.minWidth=Math.max(600,arr.length*43)+'px';$('#csChart').innerHTML=html;
    $$('#csChart [data-seek]').forEach(b=>b.addEventListener('click',()=>seekTo(Number(b.dataset.seek)))); }
  function download(filename,content,mime){const blob=new Blob(['\uFEFF',content],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function csv(rows){return rows.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');}
  $('#csExport').addEventListener('click',()=>{if(!state.intervals.length){notify('먼저 CS 데이터를 불러오세요.',true);return;}download('evidencelab_cs.csv',csv([['start_s','end_s','cs_delta','duration_min','cs_per_min','jungle_delta'],...state.intervals.map(r=>[r.start,r.end,r.delta,r.minutes.toFixed(3),r.rate.toFixed(3),r.jungleDelta])]),'text/csv;charset=utf-8');});
  function classify(text){const english=new Set((String(text).toLowerCase().match(/[a-z0-9]+/g)||[]));const paper=paperTerms.filter(t=>english.has(t));const korean=koPatterns.filter(x=>x.re.test(text)).map(x=>x.name);return {paper,korean,flag:paper.length>0||korean.length>0};}
  function analyzeChat(){const source=$('#chatInput').value;if(source.length>150000){notify('채팅 입력은 최대 15만 자까지 지원합니다.',true);return;}let lines=source.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,5000);state.chat=lines.map((raw,i)=>{const match=raw.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/);const at=match?asSeconds(match[1]):null;const content=match?match[2]:raw;const verdict=classify(content);return {id:i+1,seconds:at,text:content,...verdict};});renderChat();renderReport();notify(`채팅 ${state.chat.length}줄 검토 완료. 검토 후보 ${state.chat.filter(x=>x.flag).length}개입니다.`);}
  $('#analyzeChat').addEventListener('click',analyzeChat);$('#chatDemo').addEventListener('click',()=>{$('#chatInput').value=sampleChat;analyzeChat();});$('#clearChat').addEventListener('click',()=>{$('#chatInput').value='';state.chat=[];renderChat();renderReport();notify('채팅 검토 결과를 초기화했습니다.');});
  function renderChat(){const el=$('#chatResults');const chat=state.chat;if(!chat.length){el.className='results-empty';el.innerHTML='입력한 채팅을 분석하면 여기에서 검토할 문장을 확인할 수 있습니다.';return;}const flagged=chat.filter(x=>x.flag).length;el.className='results-table';el.innerHTML=`<div style="padding:15px;font-size:12px;color:var(--muted)">전체 ${chat.length}줄 · 검토 후보 ${flagged}줄 · 정상 확정 / 제재 판정 아님</div><table><thead><tr><th>시점</th><th>채팅</th><th>검토 신호</th><th>이동</th></tr></thead><tbody>${chat.map(x=>{const labels=[...x.paper.map(t=>`영어 금칙어: ${t}`),...x.korean];return `<tr><td>${x.seconds===null?'—':timeFmt(x.seconds)}</td><td>${esc(x.text)}</td><td><span class="tag ${x.flag?'':'clear'}">${x.flag?esc(labels.join(' / ')):'보조 규칙 검출 없음'}</span></td><td>${x.seconds===null?'—':`<button class="text-button" data-seek="${x.seconds}">영상 이동</button>`}</td></tr>`}).join('')}</tbody></table>`;$$('#chatResults [data-seek]').forEach(b=>b.addEventListener('click',()=>seekTo(Number(b.dataset.seek))));}
  const video=$('#video');
  let reviewTimeOverride=null;
  function syncVideoTime(force=false){
    const at=Math.max(0,Math.round(Number(video.currentTime)||0));
    $('#currentTime').textContent=timeFmt(at);
    const time=reviewTimeOverride!==null&&!force?reviewTimeOverride:at;
    const label=$('#caseTimeLabel');
    if(label)label.textContent=state.videoUrl?timeFmt(time):'영상 선택 전';
    if($('#caseTime'))$('#caseTime').value=state.videoUrl?timeFmt(time):'';
  }
  video.addEventListener('timeupdate',()=>syncVideoTime());
  video.addEventListener('seeked',()=>{reviewTimeOverride=null;syncVideoTime(true);});
  video.addEventListener('loadedmetadata',()=>{$('#videoEmpty').hidden=true;$('#ocrStart').value=String(Math.floor(video.currentTime));syncVideoTime(true);});
  video.addEventListener('error',()=>notify('이 영상 코덱은 브라우저에서 재생할 수 없을 수 있습니다. MP4(H.264) 형식으로 변환하거나 다른 브라우저를 사용하세요.',true));
  $('#videoFile').addEventListener('change',(e)=>{const file=e.target.files?.[0];if(!file)return;try{if(state.videoUrl)URL.revokeObjectURL(state.videoUrl);state.videoUrl=URL.createObjectURL(file);video.src=state.videoUrl;$('#videoName').textContent=`${file.name} · ${(file.size/1024/1024/1024).toFixed(2)}GB · 로컬 파일`;$('#videoEmpty').hidden=true;$('#goAutoAnalysis').disabled=false;reviewTimeOverride=null;syncVideoTime(true);notify('영상 파일을 열었습니다. 분석을 시작할 수 있습니다.');}catch(err){notify(err.message,true);}});
  function seekTo(sec){tab('video');if(!video.src||!Number.isFinite(video.duration)){notify('해당 시간으로 이동하려면 영상을 선택해야 합니다.',true);return;}reviewTimeOverride=Math.min(Math.max(0,sec),video.duration);video.currentTime=reviewTimeOverride;syncVideoTime();notify(`${timeFmt(sec)} 장면으로 이동했습니다.`);}
  function addEvent(event){state.events.push({...event,id:Date.now()+Math.random()});state.events.sort((a,b)=>a.seconds-b.seconds);renderEvents();renderReport();}
  $('#goAutoAnalysis').addEventListener('click',()=>{
    tab('auto');
    if(window.PlayCheckAuto?.scanVideo) window.PlayCheckAuto.scanVideo();
    else notify('영상 분석 기능을 불러오지 못했습니다. 페이지를 다시 열어 주세요.',true);
  });
  $('#addEvent').addEventListener('click',()=>{const text=$('#eventFact').value.trim();if(!text){notify('영상에서 관찰한 사실을 적어 주세요.',true);return;}if(text.length>5000){notify('근거는 5,000자 이하로 작성해 주세요.',true);return;}addEvent({seconds:Number.isFinite(video.currentTime)?Math.round(video.currentTime):0,type:$('#eventType').value,fact:text,alternative:$('#eventAlternative').value.trim(),status:$('#eventStatus').value,source:'직접 기록'});$('#eventFact').value='';$('#eventAlternative').value='';notify('근거 메모가 추가되었습니다.');});
  function addSampleEvents(){if(state.events.some(x=>x.source==='가상 예시'))return;addEvent({seconds:912,type:'채팅/선언',fact:'[가상 예시] 채팅에서 오픈 선언이 보임',alternative:'선언 후 실제 행동은 별도 확인해야 함',status:'검토 필요',source:'가상 예시'});addEvent({seconds:1180,type:'CS 탈취 의심',fact:'[가상 예시] 특정 구간에 정글러 라인 CS 증가',alternative:'정상적인 라인 커버·웨이브 정리 가능성',status:'검토 필요',source:'가상 예시'});}
  $('#sampleEvents').addEventListener('click',()=>{addSampleEvents();notify('가상 예시 2건을 추가했습니다. 실제 경기 분석 결과가 아닙니다.');});
  function renderEvents(){const arr=state.events;$('#eventCount').textContent=String(arr.length);const list=$('#eventList');if(!arr.length){list.innerHTML='<div class="results-empty">아직 기록한 근거가 없습니다.</div>';return;}list.innerHTML=arr.map(e=>`<div class="event-item"><button class="event-time" data-seek="${e.seconds}" title="해당 시점 영상으로 이동">${timeFmt(e.seconds)} ↗</button><div><div class="event-type">${esc(e.type)} <span class="event-status">${esc(e.status)}</span></div><p>${esc(e.fact)}</p><p><small>다른 해석: ${esc(e.alternative||'미입력')} · ${esc(e.source)}</small></p></div><button class="delete-event" data-id="${e.id}" aria-label="기록 삭제">삭제</button></div>`).join('');$$('#eventList [data-seek]').forEach(b=>b.addEventListener('click',()=>seekTo(Number(b.dataset.seek))));$$('#eventList [data-id]').forEach(b=>b.addEventListener('click',()=>{state.events=state.events.filter(x=>String(x.id)!==b.dataset.id);renderEvents();renderReport();}));}
  function summary(){const cs=state.intervals,chat=state.chat,ev=state.events;return [
    'LoL 트롤링 판독기 v5 · 경기 분석 결과',
    `공통 기준 사건: ${window.EvidenceCommon?.count()??0}건`,
    '연결 논문: 팀 기반 온라인 게임에서 비협조적 행동의 발생 요인과 제재 판단의 한계에 관한 연구',
    '논문 채팅 실험 평균 F1: 금칙어 0.5334 / 학습 토큰 점수 0.6849 (앱 자체의 탐지 정확도 아님)',
    `CS 데이터: ${state.source||'없음'}`,
    `CS 분석: ${cs.length}구간 / 획득 일반 미니언 ${cs.reduce((a,x)=>a+x.delta,0)}개 / 표시 기준 초과 ${cs.filter(x=>x.rate>csThreshold()).length}구간`,
    `채팅 입력: ${chat.length}줄 / 보조 검토 후보 ${chat.filter(x=>x.flag).length}줄`,
    `영상 근거: ${ev.length}건 / 검토 필요 ${ev.filter(x=>x.status==='검토 필요').length}건`,
    `자동 검토 후보: ${window.PlayCheckAuto?.snapshot()?.length??0}건`,
    '', '주의: 탐지 신호는 고의적 방해 및 제재 대상이라는 결론이 아닙니다.',
    '정상 플레이·전략 차이·기술적 문제 가능성을 별도로 검토하세요.'
  ].join('\n');}
  function renderReport(){$('#reportCases').textContent=String(window.EvidenceCommon?.count()??0);$('#reportCs').textContent=String(state.intervals.length);$('#reportChat').textContent=String(state.chat.filter(x=>x.flag).length);$('#reportEvents').textContent=String(state.events.length);$('#reportPreview').textContent=summary();}
  function getExport(){return {application:'LoL Griefing Analyzer',version:'5.0',purpose:'연구 기반 증거 검토, 자동 제재 판정 아님',paper:{title:'팀 기반 온라인 게임에서 비협조적 행동의 발생 요인과 제재 판단의 한계에 관한 연구',fixedKeywordF1:0.5334,trainedTokenScoreF1:0.6849,remark:'논문 실험 결과. 이 앱의 탐지 성능이 아님'},data:{source:state.source,participantId:state.participant,csIntervals:state.intervals,chat:state.chat,annotations:state.events,commonStandardCases:window.EvidenceCommon?.snapshot()??[],autoFindings:window.PlayCheckAuto?.snapshot()??[]},generatedAt:new Date().toISOString()};}
  $('#downloadJson').addEventListener('click',()=>download('evidencelab_review.json',JSON.stringify(getExport(),null,2),'application/json;charset=utf-8'));
  $('#downloadTxt').addEventListener('click',()=>download('evidencelab_review.txt',summary()+'\n\n'+state.events.map(e=>`${timeFmt(e.seconds)} [${e.type}] ${e.fact}\n검토: ${e.status}\n다른 해석: ${e.alternative||'미입력'}`).join('\n\n'),'text/plain;charset=utf-8'));
  $('#downloadChat').addEventListener('click',()=>download('evidencelab_chat.csv',csv([['time_s','text','paper_terms','korean_supplementary','review_candidate'],...state.chat.map(c=>[c.seconds,c.text,c.paper.join('|'),c.korean.join('|'),c.flag])]),'text/csv;charset=utf-8'));

  // OCR: lazy-loaded optional browser experiment. No server upload; model download requires network.
  async function ensureOCR(){if(state.ocrWorker)return state.ocrWorker;if(!window.Tesseract){$('#ocrStatus').textContent='OCR 스크립트 다운로드 중...';await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('OCR 라이브러리를 내려받지 못했습니다. 인터넷 연결을 확인하세요.'));document.head.appendChild(s);});}$('#ocrStatus').textContent='한국어/영어 인식 모델 준비 중...';state.ocrWorker=await window.Tesseract.createWorker(['kor','eng'],1,{logger:(m)=>{if(m.status==='recognizing text')$('#ocrStatus').textContent=`OCR 인식 중 ${Math.round((m.progress||0)*100)}%`;}});
    // OCR 기본 PSM 3은 한두 줄짜리 게임 채팅을 통째로 놓칠 수 있음. PSM 6은 블록 내 글자 탐색에 적합.
    await state.ocrWorker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
    return state.ocrWorker;}
  function frameCanvas(variant='original'){
    if(video.readyState<2||!video.videoWidth||!video.videoHeight)throw Error('영상에서 재생 가능한 화면을 읽지 못했습니다.');
    const region=$('#ocrCrop')?.value||'left-bottom';
    const full=region==='full',wide=region==='left-wide';
    const W=video.videoWidth,H=video.videoHeight;
    // 일반적인 LoL 채팅 위치. 이전 55~99% 범위는 HUD/아이템을 과도하게 포함했습니다.
    const x=0,y=full?0:Math.floor(H*(wide?.34:.45));
    const w=full?W:Math.floor(W*(wide?.62:.50));
    const h=full?H:Math.floor(H*(wide?.58:.42));
    const c=document.createElement('canvas');
    const scale=full?Math.min(1.2,1920/w):Math.min(3.0,1800/w);
    c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(video,x,y,w,h,0,0,c.width,c.height);
    if(variant==='contrast'){
      const img=ctx.getImageData(0,0,c.width,c.height),d=img.data;
      for(let i=0;i<d.length;i+=4){
        const lum=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
        const bright=Math.max(d[i],d[i+1],d[i+2]);
        const ink=lum>119||(bright>168&&lum>91);
        const v=ink?0:255;
        d[i]=v;d[i+1]=v;d[i+2]=v;
      }
      ctx.putImageData(img,0,0);
    }
    return c;
  }
  async function scanOne(worker){const canvas=frameCanvas();const r=await worker.recognize(canvas);return String(r.data.text||'').replace(/\s+/g,' ').trim();}
  async function setVideoTime(target){if(!Number.isFinite(video.duration))throw Error('영상 메타데이터를 확인하지 못했습니다.');target=Math.min(Math.max(0,target),Math.max(0,video.duration-.01));if(Math.abs(video.currentTime-target)<.08)return;await new Promise((resolve,reject)=>{let timer;const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);video.removeEventListener('error',fail);};const done=()=>{cleanup();resolve();};const fail=()=>{cleanup();reject(Error('영상 프레임을 읽지 못했습니다.'));};video.addEventListener('seeked',done,{once:true});video.addEventListener('error',fail,{once:true});timer=setTimeout(()=>{cleanup();reject(Error('영상 구간 탐색 시간이 초과되었습니다. 해당 코덱 또는 파일을 확인하세요.'));},12000);try{video.currentTime=target;}catch(e){cleanup();reject(e);}});}
  function addOCRText(lines){const old=$('#chatInput').value.trim();const more=lines.join('\n');if(!more)return;$('#chatInput').value=old?`${old}\n${more}`:more;analyzeChat();}
  async function executeOCR(mode){if(state.busy){notify('현재 OCR 작업이 진행 중입니다.',true);return;}if(!state.videoUrl){notify('먼저 영상을 선택하세요.',true);return;}state.busy=true;$('#ocrFrame').disabled=true;$('#ocrScan').disabled=true;const original=video.currentTime;video.pause();const lines=[],seen=new Set();try{await window.PlayCheckLiveOCR?.pauseForScan?.();const worker=await ensureOCR();const begin=mode==='frame'?original:Math.max(0,Number($('#ocrStart').value)||0),length=Math.min(120,Math.max(5,Number($('#ocrLength').value)||30)),step=Math.min(30,Math.max(3,Number($('#ocrStep').value)||5));const count=mode==='frame'?1:Math.min(30,Math.ceil(length/step));for(let i=0;i<count;i++){const point=mode==='frame'?original:begin+i*step;if(point>=video.duration)break;await setVideoTime(point);const content=await scanOne(worker);const key=content.toLowerCase().replace(/\s+/g,'').slice(0,200);if(content.length>1&&!seen.has(key)){seen.add(key);lines.push(`${timeFmt(point)}  OCR: ${content}`);}$('#ocrStatus').textContent=`OCR ${i+1}/${count} 프레임 검사 · ${lines.length}개 추출`;}
      $('#ocrOutput').hidden=false;$('#ocrOutput').textContent=lines.length?lines.join('\n'):'읽을 수 있는 문자를 발견하지 못했습니다. 화면 영역과 영상 품질을 확인하세요.';addOCRText(lines);notify(`OCR 완료: ${lines.length}개 고유 프레임 문장 추출. 중복 제거는 단순 문자열 기준이며 실제 채팅 메시지 수와 다릅니다.`);}
    catch(e){notify(`OCR 오류: ${e.message}`,true);$('#ocrStatus').textContent='OCR 실패 · 채팅 수동 입력은 계속 사용할 수 있습니다.';}finally{state.busy=false;$('#ocrFrame').disabled=false;$('#ocrScan').disabled=false;try{if(Number.isFinite(video.duration))await setVideoTime(original);}catch(e){/* best effort */}window.PlayCheckLiveOCR?.resumeAfterScan?.();} }
  $('#ocrFrame').addEventListener('click',()=>executeOCR('frame'));
  $('#ocrScan').addEventListener('click',()=>executeOCR('range'));
  window.PlayCheckBridge={tab,seekTo,download,notify,analyzeChat,renderReport,video,ensureOCR,frameCanvas,scanOne,setVideoTime,addEvent,formatTime:timeFmt,hasVideo:()=>!!state.videoUrl,selectReviewTime:(at)=>{reviewTimeOverride=Math.max(0,Number(at)||0);syncVideoTime();}};
  // No persistent storage of actual footage or personal data.
  renderEvents();renderReport();
})();
