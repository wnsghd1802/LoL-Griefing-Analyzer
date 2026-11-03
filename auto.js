(() => {
'use strict';
const $=q=>document.querySelector(q);
const bridge=window.PlayCheckBridge;
const rules=window.PlayCheckHeuristics;
const rows=[];
let timeline=null,videoBusy=false,cancelRequested=false,seq=0;
function fmt(sec){return bridge.formatTime(sec);}
function text(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function note(s,error=false){bridge.notify(s,error);}
function merge(items){const existing=new Set(rows.map(x=>`${x.source}:${Math.floor(x.at)}:${x.rule}:${x.participantId??''}`));for(const x of items){const k=`${x.source}:${Math.floor(x.at)}:${x.rule}:${x.participantId??''}`;if(!existing.has(k)){rows.push({id:++seq,status:'검토 필요',...x});existing.add(k);}}rows.sort((a,b)=>a.at-b.at);render();bridge.renderReport();}
function render(){
 $('#autoCount').textContent=String(rows.length);
 const counts=rows.reduce((m,r)=>(m[r.source]=(m[r.source]??0)+1,m),{});
 $('#autoSummary').textContent=`전체 ${rows.length}개 · 영상 채팅 OCR ${counts['영상 OCR']??0}개 · 경기 타임라인 ${counts['경기 타임라인']??0}개 · 고의성은 별도 검토`; 
 const box=$('#autoFindings');
 if(!rows.length){box.innerHTML='<div class="results-empty">아직 후보가 없습니다. 의심 신호가 감지되지 않아도 정상으로 확정되는 것은 아닙니다.</div>';return;}
 box.innerHTML=rows.map(r=>`<div class="auto-finding"><div><button class="text-button auto-finding-time" data-seek="${r.at}">${fmt(r.at)} ↗</button><span class="kind">${text(r.source)}</span></div><div><h5>${text(r.title)}</h5><p>${text(r.fact)}</p><p><b>정상 가능성:</b> ${text(r.alternative)}</p><p class="subline">${text(r.detail||'')} · 분류: ${text(r.category)}</p><label class="subline">검토 상태 <select data-status="${r.id}"><option>검토 필요</option><option>판단 불가</option><option>정상 설명 가능</option><option>추가 근거 확인</option></select></label><div class="toolrow"><button class="text-button" data-record="${r.id}">이 시점 기록에 추가 +</button></div></div></div>`).join('');
 for(const el of box.querySelectorAll('[data-seek]'))el.onclick=()=>bridge.seekTo(Number(el.dataset.seek));
 for(const el of box.querySelectorAll('[data-status]')){const r=rows.find(r=>String(r.id)===el.dataset.status);el.value=r?.status??'검토 필요';el.onchange=()=>{if(r)r.status=el.value;bridge.renderReport();};}
 for(const el of box.querySelectorAll('[data-record]'))el.onclick=()=>{const r=rows.find(r=>String(r.id)===el.dataset.record);if(!r)return;bridge.addEvent({seconds:Math.round(r.at),type:r.category,fact:r.fact,alternative:r.alternative,status:'검토 필요',source:`자동 후보: ${r.source}`});note('검토 후보를 영상 근거 기록에 추가했습니다.');};
}
function progress(done,total,msg){let p=total?Math.round(100*done/total):0;$('#autoProgress').setAttribute('aria-valuenow',String(p));$('#autoProgressBar').style.width=p+'%';$('#autoVideoStatus').textContent=`${msg} · ${done}/${total}프레임 (${p}%)`;}
async function scanVideo(){
 if(videoBusy){note('이미 분석 중입니다.',true);return;}
 const video=bridge.video;
 if(!bridge.hasVideo()||!Number.isFinite(video.duration)||video.duration<=0){note('먼저 영상 보기에서 재생 가능한 영상 파일을 선택하세요.',true);return;}
 const start=Number($('#autoStart').value),endRaw=$('#autoEnd').value.trim(),end=endRaw===''?video.duration:Number(endRaw),step=Number($('#autoStep').value);
 if(![start,end,step].every(Number.isFinite)||start<0||end<=start||end>video.duration+.5||step<=0){note('분석 시작·종료 시간을 확인하세요. 끝 시각은 영상 길이 이하여야 합니다.',true);return;}
 const count=Math.ceil((end-start)/step);
 if(count>1800){note(`선택 범위는 ${count}프레임입니다. 한 번에 최대 1,800프레임을 지원하니 구간을 나누거나 간격을 늘려 주세요.`,true);return;}
 videoBusy=true;cancelRequested=false;$('#autoStartBtn').disabled=true;$('#autoStopBtn').disabled=false;
 const original=video.currentTime;video.pause();
 const found=[],seen=new Map();let examined=0;
 try{
  $('#autoVideoStatus').textContent='한국어·영어 OCR 모델 준비 중...';
  const worker=await bridge.ensureOCR();
  $('#ocrCrop').value=$('#autoCrop').value;
  for(let i=0;i<count;i++){
   if(cancelRequested)break;
   let at=Math.min(end-.05,start+i*step);
   if(at>=video.duration)break;
   await bridge.setVideoTime(at);
   const canvas=bridge.frameCanvas();
   const result=await worker.recognize(canvas);
   const s=String(result.data?.text??'').replace(/\s+/g,' ').trim().slice(0,500);
   const labels=rules.classifyOCR(s);
   if(labels.length){
     const signature=s.toLowerCase().replace(/[^\p{L}\d]/gu,'').slice(0,120);
     const prev=seen.get(signature);
     if(signature.length>=3 && (prev===undefined||at-prev>=60)){
      seen.set(signature,at);
      found.push({source:'영상 OCR',at,category:labels.join(' / '),title:labels[0],rule:'OCR 문구',fact:`화면에서 읽힌 글자: “${s}”`,alternative:'OCR 오인식·인용·농담·실제 게임 진행 여부를 영상과 함께 확인해야 합니다.',detail:`화면 표본 ${i+1}번째 · OCR 평균 인식 신뢰도 ${Math.round(Number(result.data?.confidence)||0)}(참고값)`});
     }
   }
   examined++; progress(examined,count,`채팅 OCR 실행 중 · 후보 ${found.length}개`);
   // keep UI responsive between sequential video seeks
   if(i%4===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  merge(found);
  if(found.length){const old=$('#chatInput').value.trim();const extra=found.map(r=>`${fmt(r.at)} OCR: ${r.fact.replace(/^화면에서 읽힌 글자: “|”$/g,'')}`).join('\n');$('#chatInput').value=old?`${old}\n${extra}`:extra;bridge.analyzeChat();}
  $('#autoVideoStatus').textContent=`${cancelRequested?'사용자가 중지했습니다':'자동 탐색 완료'} · ${examined}프레임 확인 · 신규 후보 ${found.length}개. 탐지되지 않은 구간도 확인이 필요할 수 있습니다.`;
  note(`영상 자동 탐색 ${cancelRequested?'중지':'완료'}: 새 검토 후보 ${found.length}건.`);
 }catch(err){$('#autoVideoStatus').textContent=`영상 자동 분석 중 오류 발생: ${err.message}`;note(`OCR 분석 실패: ${err.message}`,true);}finally{videoBusy=false;$('#autoStartBtn').disabled=false;$('#autoStopBtn').disabled=true;try{await bridge.setVideoTime(original);}catch(_){/* keep output */}}
}
$('#autoStartBtn').onclick=scanVideo;
$('#autoStopBtn').onclick=()=>{cancelRequested=true;$('#autoVideoStatus').textContent='중지 요청을 받았습니다. 현재 프레임 처리가 끝나면 종료합니다.';};
function populateIds(ids){$('#autoJungleId').innerHTML='<option value="">선택 안 함 · CS 탈취 의심 생략</option>'+ids.map(id=>`<option value="${text(id)}">참가자 ${text(id)} (역할 직접 확인)</option>`).join('');}
function loadTimeline(raw,filename){const result=rules.analyzeTimeline(raw,{jungleId:'',csRate:5});timeline=raw;populateIds(result.participants);$('#autoTimelineBtn').disabled=false;$('#autoTimelineStatus').textContent=`${filename} · ${result.meta.frames}개 타임라인 프레임 · 참가자 ${result.participants.length}명. 정글러 ID를 알면 선택해 주세요.`;return result;}
$('#autoTimeline').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>80*1024*1024)throw Error('타임라인 JSON 파일은 80MB 이하여야 합니다.');let data=JSON.parse(await file.text());loadTimeline(data,file.name);note('타임라인을 읽었습니다. 이제 패턴 분석하기를 누르세요.');}catch(e){timeline=null;$('#autoTimelineBtn').disabled=true;note(`타임라인 읽기 실패: ${e.message}`,true);}finally{e.target.value='';}};
$('#autoTimelineBtn').onclick=()=>{if(!timeline){note('타임라인 JSON을 먼저 선택하세요.',true);return;}try{const result=rules.analyzeTimeline(timeline,{jungleId:$('#autoJungleId').value,csRate:Number($('#autoCsRate').value)});merge(result.findings);$('#autoTimelineStatus').textContent=`타임라인 분석 완료 · 이번 분석에서 ${result.findings.length}개 후보 발견 · 총 ${rows.length}개 누적. 정글러 여부를 직접 확인해야 합니다.`;note('경기 타임라인에서 자동 후보를 찾았습니다. 정상 전략 가능성도 함께 확인해 주세요.');}catch(e){note(e.message,true);}};
$('#autoDemoBtn').onclick=()=>{
 const demo={metadata:{matchId:'SYNTHETIC-DEMO'},info:{frames:[]}};
 for(let m=0;m<=13;m++){
  const f={timestamp:m*60000,participantFrames:{},events:[]};
  for(let id=1;id<=3;id++){
    let cs=id===2?Math.max(0,Math.floor(m*1.0)+(m>5?m*4-20:0)):m*4;
    let x=id===3&&m>=5&&m<=10?5400:1000+m*180+id*200,y=id===3&&m>=5&&m<=10?5400:1200+m*170+id*100;
    f.participantFrames[id]={participantId:id,minionsKilled:cs,jungleMinionsKilled:id===2?m*5:0,position:{x,y}};
  }
  if([5,7,9].includes(m))f.events.push({type:'CHAMPION_KILL',victimId:1,timestamp:m*60000});
  demo.info.frames.push(f);
 }
 loadTimeline(demo,'가상 데모 데이터 (실제 경기 아님)');$('#autoJungleId').value='2';const r=rules.analyzeTimeline(demo,{jungleId:'2',csRate:5});merge(r.findings.map(f=>({...f,source:'가상 예시',fact:`[가상 예시] ${f.fact}`})));note(`가상 데이터 분석 완료: 후보 ${r.findings.length}건. 실제 경기의 고의성을 판단한 결과가 아닙니다.`);
};

$('#autoImport').onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>10*1024*1024)throw Error('결과 파일은 최대 10MB만 지원합니다.');
  const data=JSON.parse(await file.text());
  if(data?.format!=='playcheck-findings'||!Array.isArray(data.items))throw Error('PlayCheck 오프라인 분석 JSON 형식이 아닙니다.');
  const imported=data.items.slice(0,3000).map(x=>{
    const at=Number(x.at);
    if(!Number.isFinite(at)||at<0||at>864000)throw Error('후보 시간 값이 올바르지 않습니다.');
    return {at,source:'오프라인 영상 OCR',category:String(x.category??'채팅/언어적 공격').slice(0,100),title:String(x.title??'OCR 검토').slice(0,200),rule:'OCR 문구',fact:String(x.fact??'').slice(0,1200),alternative:String(x.alternative??'인식 결과와 실제 영상의 맥락을 확인해야 합니다.').slice(0,1200),detail:'오프라인 분석 결과에서 가져옴',status:'검토 필요'};
  });
  merge(imported);
  note(`오프라인 결과 ${imported.length}개를 불러왔습니다. 영상 화면에서 재검토해 주세요.`);
 }catch(err){note(`가져오기 실패: ${err.message}`,true);}finally{e.target.value='';}
};

$('#autoExport').onclick=()=>{
 if(!rows.length){note('저장할 자동 탐색 후보가 없습니다.',true);return;}
 const payload={app:'PlayCheck',version:'4.0',purpose:'의심 신호 검토 보조, 고의성 확정 아님',exportedAt:new Date().toISOString(),items:rows.map(x=>({...x}))};
 bridge.download('playcheck_auto_candidates.json',JSON.stringify(payload,null,2),'application/json;charset=utf-8');
};
window.PlayCheckAuto={snapshot:()=>rows.map(x=>({...x})),analyzeTimeline:rules.analyzeTimeline};
render();
})();
