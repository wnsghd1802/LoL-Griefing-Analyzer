(() => {
'use strict';
const $=q=>document.querySelector(q);
const bridge=window.PlayCheckBridge;
const rules=window.PlayCheckHeuristics;
const rows=[];
let timeline=null,videoBusy=false,cancelRequested=false,visionBusy=false,visionStop=false,seq=0;
function fmt(sec){return bridge.formatTime(sec);}
function text(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function note(s,error=false){bridge.notify(s,error);}
function merge(items){const existing=new Set(rows.map(x=>`${x.source}:${Math.floor(x.at)}:${x.rule}:${x.participantId??''}`));for(const x of items){const k=`${x.source}:${Math.floor(x.at)}:${x.rule}:${x.participantId??''}`;if(!existing.has(k)){rows.push({id:++seq,status:'검토 필요',...x});existing.add(k);}}rows.sort((a,b)=>a.at-b.at);render();bridge.renderReport();}
function render(){
 $('#autoCount').textContent=String(rows.length);
 const counts=rows.reduce((m,r)=>(m[r.source]=(m[r.source]??0)+1,m),{});
 $('#autoSummary').textContent=`전체 ${rows.length}개 · 영상 채팅 OCR ${(counts['영상 OCR']??0)+(counts['재생 중 OCR']??0)}개 · 경기 타임라인 ${counts['경기 타임라인']??0}개 · 고의성은 별도 검토`; 
 const box=$('#autoFindings');
 if(!rows.length){box.innerHTML='<div class="results-empty">아직 후보가 없습니다. 의심 신호가 감지되지 않아도 정상으로 확정되는 것은 아닙니다.</div>';return;}
 box.innerHTML=rows.map(r=>`<div class="auto-finding"><div><button class="text-button auto-finding-time" data-seek="${r.at}">${fmt(r.at)} ↗</button><span class="kind">${text(r.source)}</span></div><div><h5>${text(r.title)}</h5><p>${text(r.fact)}</p><p><b>정상 가능성:</b> ${text(r.alternative)}</p><p class="subline">${text(r.detail||'')} · 분류: ${text(r.category)}</p><label class="subline">검토 상태 <select data-status="${r.id}"><option>검토 필요</option><option>판단 불가</option><option>정상 설명 가능</option><option>추가 근거 확인</option></select></label><div class="toolrow"><button class="text-button" data-record="${r.id}">기록에 추가</button><button class="text-button" data-review="${r.id}">이 장면 자세히 확인</button></div></div></div>`).join('');
 for(const el of box.querySelectorAll('[data-seek]'))el.onclick=()=>{bridge.seekTo(Number(el.dataset.seek));window.EvidenceCommon?.useFinding?.(rows.find(r=>String(r.at)===el.dataset.seek)||{});};
 for(const el of box.querySelectorAll('[data-status]')){const r=rows.find(r=>String(r.id)===el.dataset.status);el.value=r?.status??'검토 필요';el.onchange=()=>{if(r)r.status=el.value;bridge.renderReport();};}
 for(const el of box.querySelectorAll('[data-review]'))el.onclick=()=>{
   const r=rows.find(r=>String(r.id)===el.dataset.review);if(!r)return;
   window.EvidenceCommon?.useFinding?.(r);
   bridge.tab('standards');
   note(`${fmt(r.at)} 장면이 검토 화면에 입력되었습니다. 영상은 수동으로 확인해야 합니다.`);
 };
 for(const el of box.querySelectorAll('[data-record]'))el.onclick=()=>{const r=rows.find(r=>String(r.id)===el.dataset.record);if(!r)return;bridge.addEvent({seconds:Math.round(r.at),type:r.category,fact:r.fact,alternative:r.alternative,status:'검토 필요',source:`자동 분석: ${r.source}`});note('검토 후보를 영상 근거 기록에 추가했습니다.');};
}
function progress(done,total,msg){let p=total?Math.round(100*done/total):0;$('#autoProgress').setAttribute('aria-valuenow',String(p));$('#autoProgressBar').style.width=p+'%';$('#autoVideoStatus').textContent=`${msg} · ${done}/${total}프레임 (${p}%)`;}
const rawSamples=[];
function showOCRSamples(samples,examined=0){
 const n=Number($('#ocrReadableCount')?.textContent||0);
 $('#ocrRawPreview').textContent=samples.length?samples.slice(-15).map(x=>`${fmt(x.at)} · ${x.raw}`).join('\n\n'):'아직 인식한 글자가 없습니다.';
 $('#ocrDebugHelp').textContent=`검사 화면 ${examined}개 · 글자 인식 화면 ${n}개 · 표시 예시 ${Math.min(samples.length,15)}개. 채팅이 안 보이면 화면 위치를 바꾸거나 화면 글자 확인을 눌러 주세요.`;
}
function collectText(raw,at,arr){
 const cleaned=String(raw??'').replace(/\s+/g,' ').trim();
 if(cleaned.length>=2){arr.push({at,raw:cleaned.slice(0,300)});if(arr.length>60)arr.shift();}
}
async function readyForVideo(video){
 if(!bridge.hasVideo())throw Error('먼저 영상 파일을 선택해 주세요.');
 if(video.readyState>=2&&Number.isFinite(video.duration)&&video.duration>0)return;
 await new Promise((resolve,reject)=>{
   const finish=(error)=>{clearTimeout(timer);video.removeEventListener('loadeddata',onReady);video.removeEventListener('error',onError);error?reject(error):resolve();};
   const onReady=()=>finish();
   const onError=()=>finish(Error('영상 재생에 실패했습니다. 코덱이 브라우저에서 지원되는지 확인하세요.'));
   const timer=setTimeout(()=>finish(Error('영상 로딩이 지연되고 있습니다. 영상 파일 형식이나 용량을 확인해 주세요.')),15000);
   video.addEventListener('loadeddata',onReady,{once:true});video.addEventListener('error',onError,{once:true});
 });
 if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('영상의 재생 시간을 읽을 수 없습니다.');
}
async function scanVideo(){
 if(videoBusy||visionBusy){note('다른 영상 분석이 진행 중입니다.',true);return;}
 const video=bridge.video;
 videoBusy=true;cancelRequested=false;$('#autoStartBtn').disabled=true;$('#autoStopBtn').disabled=false;
 let original=video.currentTime,examined=0,readable=0,delivered=0;
 const found=[],seen=new Map(),samples=[];
 try{
  $('#autoVideoStatus').textContent='영상 파일 읽는 중...';
  await readyForVideo(video);
  video.pause();
  await window.PlayCheckLiveOCR?.pauseForScan?.();
  const start=Number($('#autoStart').value),endRaw=$('#autoEnd').value.trim(),end=endRaw===''?video.duration:Number(endRaw),step=Number($('#autoStep').value);
  if(![start,end,step].every(Number.isFinite)||start<0||end<=start||end>video.duration+.5||step<=0)throw Error('시작·종료 시간과 간격을 확인하세요. 종료 시각은 영상 길이 이하여야 합니다.');
  const count=Math.ceil((end-start)/step);
  if(count>3600)throw Error(`검사 화면 ${count}개가 최대 3,600개를 넘습니다. 간격을 늘리거나 범위를 나눠 주세요.`);
  original=video.currentTime;video.pause();
  $('#autoVideoStatus').textContent='한국어·영어 문자 인식 모델을 준비하는 중... 첫 실행은 인터넷 연결이 필요합니다.';
  const worker=await bridge.ensureOCR();
  $('#ocrCrop').value=$('#autoCrop').value;
  $('#ocrReadableCount').textContent='0';showOCRSamples([],0);
  for(let i=0;i<count;i++){
   if(cancelRequested)break;
   const at=Math.min(end-.05,start+i*step);
   if(at>=video.duration)break;
   await bridge.setVideoTime(at);
   let canvas=bridge.frameCanvas();
   let result=await worker.recognize(canvas);
   let raw=String(result.data?.text??'').trim();
   let candidates=rules.extractOCRCandidates(raw);
   if(!candidates.length && (raw.length<18 || i%3===0)){
     const enhanced=bridge.frameCanvas('contrast');
     const second=await worker.recognize(enhanced);
     const alt=String(second.data?.text??'').trim();
     const secondCandidates=rules.extractOCRCandidates(alt);
     if(secondCandidates.length || (!raw&&alt)){raw=alt;candidates=secondCandidates;canvas=enhanced;result=second;}
   }
   window.PlayCheckChatLog?.appendFrame(raw,at,'전체 영상 분석');
   if(raw.length>=2){readable++;$('#ocrReadableCount').textContent=String(readable);collectText(raw,at,samples);}
   if(i%5===0){
     const roi=$('#ocrCropPreview');
     if(roi){canvas.style.cssText='display:block;width:100%;max-width:100%;height:auto;border-radius:8px;';roi.replaceChildren(canvas);}
   }
   for(const c of candidates){
     const signature=c.labels.join('/')+':'+c.snippet.normalize('NFKC').toLowerCase().replace(/[^\p{L}\d]/gu,'').slice(0,120);
     const prev=seen.get(signature);
     if(signature.length<5||(prev!==undefined&&at-prev<75))continue;
     seen.set(signature,at);
     found.push({source:'영상 OCR',at,category:c.labels.join(' / '),title:c.labels[0],rule:'OCR 문구',fact:`화면에서 읽힌 글자: “${c.snippet}”`,alternative:'문자 오인식·인용·농담·실제 경기 행동 여부를 함께 확인해야 합니다.',detail:`화면 ${i+1}번째 · 문자 인식 신뢰도 ${Math.round(Number(result.data?.confidence)||0)} (참고값)`});
   }
   if(found.length>delivered){merge(found.slice(delivered));delivered=found.length;}
   examined++;progress(examined,count,`채팅 OCR 분석 중 · 글자 인식 ${readable}개 화면 · 의심 표현 ${found.length}개`);
   if(i%3===0){showOCRSamples(samples,examined);await new Promise(resolve=>setTimeout(resolve,0));}
  }
  merge(found);
  if(found.length){const old=$('#chatInput').value.trim();const extra=found.map(r=>`${fmt(r.at)} OCR: ${r.fact.replace(/^화면에서 읽힌 글자: “|”$/g,'')}`).join('\n');$('#chatInput').value=old?`${old}\n${extra}`:extra;bridge.analyzeChat();}
  showOCRSamples(samples,examined);
  const state=cancelRequested?'중지됨':'완료';
  $('#autoVideoStatus').textContent=`${state} · 화면 ${examined}개 검사 · 글자 인식 ${readable}개 화면 · 부적절한 표현 후보 ${found.length}건${!found.length?(readable?' · 읽힌 글자가 맞는지 아래에서 확인하세요.':' · 채팅 글자가 읽히지 않았습니다. 화면 위치·화질·채팅 표시 시간을 확인하세요.'):''}`;
  note(`영상 채팅 검사 ${state}: ${found.length}건을 찾았습니다. 실제 인식 텍스트를 아래에서 확인할 수 있습니다.`);
 }catch(err){$('#autoVideoStatus').textContent=`채팅 분석 실패: ${err.message}`;note(`채팅 분석 실패: ${err.message}`,true);}
 finally{videoBusy=false;$('#autoStartBtn').disabled=false;$('#autoStopBtn').disabled=true;try{if(Number.isFinite(video.duration))await bridge.setVideoTime(original);}catch(_){/* 결과 유지 */}window.PlayCheckLiveOCR?.resumeAfterScan?.();}
}
async function previewCurrentFrame(){
 if(videoBusy||visionBusy){note('먼저 진행 중인 분석을 종료해 주세요.',true);return;}
 const video=bridge.video;
 try{
  await readyForVideo(video);
  $('#autoVideoStatus').textContent='현재 화면에서 글자 읽는 중...';
  await window.PlayCheckLiveOCR?.pauseForScan?.();
  const worker=await bridge.ensureOCR();
  $('#ocrCrop').value=$('#autoCrop').value;
  const canvas=bridge.frameCanvas();
  const result=await worker.recognize(canvas);
  const raw=String(result.data?.text??'').trim();
  window.PlayCheckChatLog?.appendFrame(raw,video.currentTime,'현재 화면 OCR');
  const roi=$('#ocrCropPreview');if(roi){canvas.style.cssText='display:block;width:100%;max-width:100%;height:auto;border-radius:8px;';roi.replaceChildren(canvas);}
  const candidates=rules.extractOCRCandidates(raw);
  $('#ocrReadableCount').textContent=raw.length>=2?'1':'0';
  showOCRSamples(raw?[{at:video.currentTime,raw:raw.slice(0,700)}]:[],1);
  $('#ocrDebug').open=true;
  $('#autoVideoStatus').textContent=raw?`현재 화면 글자 인식됨 · 의심 표현 후보 ${candidates.length}개 · 전체 구간을 검사하려면 '채팅 분석 다시 시작'을 누르세요.`:'현재 화면에서는 글자를 읽지 못했습니다. 채팅창이 보이는 프레임인지, 화면 위치가 맞는지 확인하세요.';
  note(raw?'현재 프레임 글자를 읽었습니다. 아래에 인식 결과를 표시했습니다.':'현재 화면의 채팅 인식 결과가 0건입니다. 화면 위치를 확인해 주세요.',!raw);
 }catch(err){$('#autoVideoStatus').textContent=`현재 화면 OCR 실패: ${err.message}`;note(err.message,true);}
 finally{window.PlayCheckLiveOCR?.resumeAfterScan?.();}
}

async function scanVisual(){
 if(visionBusy||videoBusy){note('다른 영상 분석이 진행 중입니다.',true);return;}
 const video=bridge.video,V=window.PlayCheckVision;
 if(!V || !bridge.hasVideo()||!Number.isFinite(video.duration)||video.duration<=0){note('먼저 재생 가능한 영상을 선택하세요.',true);return;}
 const step=Number($('#visionStep').value)||20,total=Math.ceil(video.duration/step);
 if(total>1800){note('영상이 길어 확인할 화면이 1,800개를 넘습니다. 더 긴 간격이 필요합니다.',true);return;}
 visionBusy=true;visionStop=false;$('#visualScanBtn').disabled=true;$('#visualStopBtn').disabled=false;
 const original=video.currentTime,wasPlaying=!video.paused;video.pause();
 const canvas=document.createElement('canvas');canvas.width=96;canvas.height=54;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});let prev=null;
 const samples=[];
 try{
  for(let i=0;i<total;i++){
   if(visionStop)break;
   const at=Math.min(video.duration-.05,i*step);
   await bridge.setVideoTime(at);
   ctx.drawImage(video,0,0,canvas.width,canvas.height);
   const metrics=V.measure(ctx.getImageData(0,0,canvas.width,canvas.height));
   samples.push({at,chroma:metrics.chroma,brightness:metrics.brightness,delta:prev?V.difference(prev,metrics):Infinity});
   prev=metrics;
   const pct=Math.round((i+1)/total*100);
   $('#visionProgress').setAttribute('aria-valuenow',String(pct));
   $('#visionProgressBar').style.width=pct+'%';
   $('#visionStatus').textContent=`화면 확인 중 · ${i+1}/${total} (${pct}%)`;
   if(i%5===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  const items=V.analyze(samples,{step});merge(items);
  $('#visionStatus').textContent=`${visionStop?'중단됨':'완료'} · ${samples.length}개 화면 확인 · 다시 볼 구간 ${items.length}개`;
  note(`화면 분석 ${visionStop?'중단':'완료'}: ${items.length}개 구간이 표시되었습니다.`);
 }catch(e){note(`화면 분석 오류: ${e.message}`,true);$('#visionStatus').textContent=`화면 분석 오류: ${e.message}`;}
 finally{visionBusy=false;$('#visualScanBtn').disabled=false;$('#visualStopBtn').disabled=true;try{await bridge.setVideoTime(original);if(wasPlaying)video.play().catch(()=>{});}catch(_){/* no-op */}}
}
$('#visualScanBtn').onclick=scanVisual;
$('#visualStopBtn').onclick=()=>{visionStop=true;$('#visionStatus').textContent='현재 화면을 확인한 뒤 중지합니다.';};

$('#autoStartBtn').onclick=scanVideo;
$('#autoPreviewBtn').onclick=previewCurrentFrame;
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
 const payload={app:'LoL Griefing Analyzer',version:'5.0',purpose:'의심 신호 검토 보조, 고의성 확정 아님',exportedAt:new Date().toISOString(),items:rows.map(x=>({...x}))};
 bridge.download('playcheck_auto_candidates.json',JSON.stringify(payload,null,2),'application/json;charset=utf-8');
};
window.PlayCheckAuto={snapshot:()=>rows.map(x=>({...x})),analyzeTimeline:rules.analyzeTimeline,scanVideo,previewCurrentFrame,isScanning:()=>videoBusy||visionBusy,addOCRFindings:items=>merge(items)};
render();
})();
