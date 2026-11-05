(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const $$=selector=>Array.from(document.querySelectorAll(selector));
  const oldInput=$('#videoFile'),video=$('#video');
  const ui={
    pick:$('#onePick'),drop:$('#oneDrop'),results:$('#oneResults'),player:$('#onePlayer'),
    status:$('#oneStatusText'),state:$('#oneState'),light:$('#oneStatusLight'),progress:$('#oneProgress'),
    checked:$('#oneExamined'),read:$('#oneRead'),suspect:$('#oneSuspicious'),logs:$('#oneLog'),
    logCount:$('#oneLogCount'),findings:$('#oneFindings'),findingsCount:$('#oneFindingsCount'),
    conclusion:$('#oneConclusion'),stop:$('#oneStop'),retry:$('#oneRetry'),export:$('#oneExport'),
    title:$('#oneDropTitle'),subtitle:$('#oneDropSub'),caption:$('#oneFileCaption'),
    crop:$('#oneCrop'),fixRetry:$('#oneFixRetry'),help:$('#oneHelp')
  };
  let currentFile=null,scanActive=false,scanStarted=false,scanFinished=false,viewFilter='all',lastKey='',demoMode=false;
  let token=0,startTimeout=0;
  const fmt=secs=>{
    const n=Math.max(0,Math.floor(Number(secs)||0));
    return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map((x,i)=>String(x).padStart(i?2:1,'0')).join(':');
  };
  const safeName=name=>String(name||'').replace(/[^\p{L}\p{N} _.-]/gu,'_').slice(0,50);
  const size=n=>n<1024*1024?(n/1024).toFixed(0)+' KB':(n/1024/1024).toFixed(1)+' MB';
  function note(text){ui.status.textContent=text;}
  function emitError(message){
    scanActive=false;scanFinished=true;ui.state.textContent='분석을 진행하지 못했습니다';
    ui.light.className='one-status-light error';note(message);ui.stop.disabled=true;
    ui.conclusion.textContent='동영상 코덱과 채팅 영역을 확인한 뒤 다시 시도해 주세요.';
  }
  function resetUI(){
    scanActive=false;scanStarted=false;scanFinished=false;lastKey='';
    window.PlayCheckAuto?.reset?.();
    window.PlayCheckChatLog?.clear?.();
    const oldProgress=$('#autoProgress'),oldProgressBar=$('#autoProgressBar'),oldStatus=$('#autoVideoStatus');
    if(oldProgress)oldProgress.setAttribute('aria-valuenow','0');
    if(oldProgressBar)oldProgressBar.style.width='0%';
    if(oldStatus)oldStatus.textContent='새 영상의 채팅 분석을 준비하고 있습니다.';
    ui.findings.replaceChildren();ui.logs.replaceChildren();
    ui.light.className='one-status-light';ui.state.textContent='자동 분석 준비 중';
    ui.progress.style.width='0%';ui.checked.textContent='0';ui.read.textContent='0';
    ui.suspect.textContent='0';ui.logCount.textContent='0';ui.findingsCount.textContent='0';
    ui.stop.disabled=false;ui.conclusion.textContent='영상에서 확인 가능한 채팅과 의심 신호를 수집합니다.';
    note('동영상 메타데이터를 읽는 중…');
  }
  function setLoadedFile(file){
    if(!file||!String(file.type).startsWith('video/')&&!/\.(mp4|webm|mkv|mov|avi)$/i.test(file.name)){
      emitError('지원되는 동영상 파일을 선택해 주세요. MP4(H.264) 또는 WebM 형식을 권장합니다.');
      return;
    }
    if(scanActive){ui.status.textContent='현재 분석을 중지한 뒤 새 영상을 선택해 주세요.';return;}
    demoMode=false;currentFile=file;token++;
    resetUI();ui.results.hidden=false;
    ui.title.textContent=file.name;
    ui.subtitle.textContent=size(file.size)+' · 영상이 선택되었습니다. 자동 분석을 시작합니다.';
    ui.caption.textContent=file.name+' · '+size(file.size)+' · 영상은 외부 서버에 전송되지 않습니다.';
    if(!ui.player.contains(video)){ui.player.replaceChildren(video);video.controls=true;video.playsInline=true;}
    const id=token;
    clearTimeout(startTimeout);
    startTimeout=setTimeout(()=>{
      if(id===token&&!scanStarted)startScan();
    },500);
  }
  function chooseFile(){oldInput?.click();}
  ui.pick.addEventListener('click',event=>{event.stopPropagation();chooseFile();});
  ui.drop.addEventListener('click',event=>{if(event.target.closest('button'))return;chooseFile();});
  ui.drop.addEventListener('keydown',event=>{if(event.target!==ui.drop)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();chooseFile();}});
  for(const name of ['dragenter','dragover']){
    ui.drop.addEventListener(name,event=>{event.preventDefault();ui.drop.classList.add('is-over');});
  }
  for(const name of ['dragleave','dragend']){
    ui.drop.addEventListener(name,()=>ui.drop.classList.remove('is-over'));
  }
  ui.drop.addEventListener('drop',event=>{
    event.preventDefault();ui.drop.classList.remove('is-over');
    const file=event.dataTransfer?.files?.[0];if(!file)return;
    try{
      oldInput.files=event.dataTransfer.files;
      oldInput.dispatchEvent(new Event('change',{bubbles:true}));
    }catch(error){emitError('파일을 가져오는 데 실패했습니다. 영상 선택 버튼으로 열어 주세요.');}
  });
  oldInput?.addEventListener('change',event=>{
    const file=event.target.files?.[0];if(!file)return;
    // The legacy file input handler (registered earlier) populates the video URL first.
    setLoadedFile(file);
  });
  async function startScan(){
    if(!currentFile||scanActive||scanStarted)return;
    const app=window.PlayCheckAuto;
    if(!app?.scanVideo){emitError('자동 분석 기능이 아직 준비되지 않았습니다. 페이지를 새로고침해 주세요.');return;}
    scanStarted=true;scanActive=true;scanFinished=false;
    ui.stop.disabled=false;ui.light.className='one-status-light';
    ui.state.textContent='자동 분석 중';
    note('한국어·영어 채팅 인식을 준비하고 있습니다. 처음 실행하는 경우 모델을 내려받습니다.');
    if($('#autoStart'))$('#autoStart').value='0';
    if($('#autoEnd'))$('#autoEnd').value='';
    if($('#autoStep'))$('#autoStep').value='2';
    if($('#autoCrop')&&ui.crop)$('#autoCrop').value=ui.crop.value;
    if($('#ocrCrop')&&ui.crop)$('#ocrCrop').value=ui.crop.value;
    // Uses the existing OCR engine; the user does not have to open its technical controls.
    try{await app.scanVideo();}catch(error){emitError('OCR 실행 오류: '+String(error.message||error));}
    if(currentFile&&scanStarted)scanActive=false;
    scanFinished=true;ui.stop.disabled=true;render();
  }
  function cancelScan(){
    if(!scanActive)return;
    const stop=$('#autoStopBtn');stop?.click();
    ui.state.textContent='분석 중지 요청됨';
    note('현재 화면의 문자 인식이 끝나면 멈춥니다.');
  }
  ui.stop.addEventListener('click',cancelScan);
  function retry(){
    if(!currentFile||demoMode){note('실제 재분석을 하려면 먼저 영상을 선택해 주세요.');return;}
    if(scanActive){cancelScan();return;}
    resetUI();
    startScan();
  }
  $('#oneSample')?.addEventListener('click',()=>{
    if(scanActive){note('진행 중인 분석을 먼저 완료하거나 중지해 주세요.');return;}
    demoMode=true;currentFile={name:'[가상 예시] 테스트 채팅',size:0};token++;
    resetUI();ui.results.hidden=false;scanFinished=true;scanStarted=true;
    ui.title.textContent='가상 예시로 미리보기';ui.subtitle.textContent='실제 게임 영상이 아닌 예시입니다. 새로운 영상을 선택하면 실제 분석을 시작합니다.';
    ui.caption.textContent='가상 데이터 시연 · 실제 플레이어의 채팅이나 판정 결과가 아닙니다.';
    const placeholder=document.createElement('div');placeholder.className='one-player-placeholder';
    placeholder.textContent='가상 예시 · 실제 영상이 없습니다';
    ui.player.replaceChildren(placeholder);
    window.PlayCheckChatLog?.appendFrame('아군: 다음 용 같이 가자',75,'가상 예시');
    window.PlayCheckChatLog?.appendFrame('아군: 오픈함',120,'가상 예시');
    window.PlayCheckChatLog?.appendFrame('아군: 그냥 해보자',145,'가상 예시');
    window.PlayCheckChatLog?.appendFrame('아군: 씨발',165,'가상 예시');
    window.PlayCheckAuto?.addOCRFindings?.([
      {source:'가상 예시',at:120,category:'게임 포기·방해 선언 후보',title:'게임 포기 선언 후보',rule:'예시',fact:'[가상 예시] 화면에서 읽힌 글자: “오픈함”',alternative:'선언 후 실제 행동은 검증되지 않음'},
      {source:'가상 예시',at:165,category:'공격적 표현 후보',title:'공격적 표현 후보',rule:'예시',fact:'[가상 예시] 화면에서 읽힌 글자: “씨발”',alternative:'언어적 공격 신호와 게임 방해 행동은 구분해야 함'}
    ]);
    render();ui.results.scrollIntoView({behavior:'smooth',block:'start'});
  });
  ui.retry.addEventListener('click',retry);
  ui.fixRetry.addEventListener('click',retry);
  ui.export.addEventListener('click',()=>{
    if(!currentFile){note('먼저 경기 영상을 선택해 주세요.');return;}
    const api=window.PlayCheckChatLog,logs=api?.snapshot?.()||[],findings=window.PlayCheckAuto?.snapshot?.()||[];
    const stats=api?.stats?.()||{checked:0,readable:0,total:0,flagged:0};
    const out=[
      'LoL 트롤링 판독기 · 자동 분석 결과',
      '분석한 파일: '+currentFile.name,
      '생성 시각: '+new Date().toLocaleString('ko-KR'),
      '분석 상태: '+ui.state.textContent,
      '검사 화면: '+stats.checked+'개',
      '인식 문장: '+stats.total+'줄',
      '표현 후보: '+findings.length+'건',
      '',
      '[의심 신호 시점]',
      ...(findings.length?findings.map(x=>fmt(x.at)+' · '+x.title+' · '+x.fact):['발견된 후보 없음 (정상 확정이 아니라 검출 규칙을 통과한 사례가 없었다는 뜻)']),
      '',
      '[인식한 글자 전체 로그]',
      ...(logs.length?logs.map(x=>fmt(x.at)+' · '+(x.flagged?'[검토] ':'')+x.text):['OCR에서 읽힌 문장 없음']),
      '',
      '안내: OCR 결과에는 글자 인식 오류 또는 실제 채팅이 아닌 게임 UI가 포함될 수 있습니다.',
      '화면에 보이지 않거나 짧게 나타난 채팅은 누락될 수 있습니다.',
      '이 결과는 고의적 게임 방해나 제재 사유를 확정하는 판정이 아닙니다.'
    ];
    window.PlayCheckBridge?.download?.('LoL_Analysis_'+safeName(currentFile.name).replace(/\.[^.]+$/,'')+'.txt',out.join('\n'),'text/plain;charset=utf-8');
  });
  $$('.one-filter button').forEach(button=>{
    button.addEventListener('click',()=>{
      viewFilter=button.dataset.oneFilter;
      $$('.one-filter button').forEach(b=>b.classList.toggle('active',b===button));
      lastKey='';render();
    });
  });
  function seek(seconds){
    if(!Number.isFinite(video.duration)||video.duration<=0)return;
    video.currentTime=Math.min(Math.max(Number(seconds)||0,0),Math.max(0,video.duration-.1));
    video.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function renderFindings(entries){
    ui.findings.replaceChildren();
    if(!entries.length){
      const empty=document.createElement('div');empty.className='one-empty';
      empty.textContent=scanFinished?'탐지된 의심 문구가 없습니다. OCR이 누락한 채팅이 있을 수 있습니다.':'분석 중 발견한 의심 장면이 이곳에 표시됩니다.';
      ui.findings.append(empty);return;
    }
    const frag=document.createDocumentFragment();
    for(const finding of entries.slice(-150).reverse()){
      const btn=document.createElement('button');btn.type='button';btn.className='one-finding';btn.title='클릭하면 해당 영상 시점으로 이동합니다';
      const t=document.createElement('span');t.className='one-at';t.textContent=fmt(finding.at);
      const body=document.createElement('span');body.className='one-finding-body';
      const title=document.createElement('strong');title.textContent=finding.title||'검토 후보';
      const fact=document.createElement('small');fact.textContent=finding.fact||'';
      body.append(title,fact);btn.append(t,body);btn.addEventListener('click',()=>seek(finding.at));
      frag.append(btn);
    }
    ui.findings.append(frag);
  }
  function renderLogs(entries){
    const visible=viewFilter==='flagged'?entries.filter(x=>x.flagged):entries;
    const atBottom=ui.logs.scrollHeight-ui.logs.scrollTop-ui.logs.clientHeight<85;
    ui.logs.replaceChildren();
    if(!visible.length){
      const empty=document.createElement('div');empty.className='one-empty';
      empty.textContent=viewFilter==='flagged'?'현재까지 분류된 의심 표현이 없습니다.':'분석 중 인식된 글자가 이곳에 쌓입니다.';
      ui.logs.append(empty);return;
    }
    const frag=document.createDocumentFragment();
    for(const item of visible.slice(-450)){
      const btn=document.createElement('button');btn.className='one-log-row'+(item.flagged?' flagged':'');btn.type='button';
      btn.setAttribute('role','listitem');
      const t=document.createElement('span');t.className='one-log-time';t.textContent=fmt(item.at);
      const b=document.createElement('span');b.className='one-log-line';
      const text=document.createElement('span');text.textContent=item.text;
      const small=document.createElement('small');small.textContent=item.flagged?('⚠ '+item.labels.join(', ')):(item.source||'OCR 추출');
      b.append(text,small);btn.append(t,b);btn.addEventListener('click',()=>seek(item.at));
      frag.append(btn);
    }
    ui.logs.append(frag);if(atBottom)ui.logs.scrollTop=ui.logs.scrollHeight;
  }
  function render(){
    if(!currentFile)return;
    const chat=window.PlayCheckChatLog?.snapshot?.()||[];
    const stats=window.PlayCheckChatLog?.stats?.()||{checked:0,readable:0,total:0,flagged:0};
    const findings=window.PlayCheckAuto?.snapshot?.()||[];
    const progress=$('#autoProgress')?.getAttribute('aria-valuenow')||'0';
    const legacy=$('#autoVideoStatus')?.textContent||'';
    ui.checked.textContent=String(stats.checked);
    ui.read.textContent=String(stats.total);
    ui.suspect.textContent=String(findings.length);
    ui.logCount.textContent=String(stats.total);
    ui.findingsCount.textContent=String(findings.length);
    ui.progress.style.width=Math.max(0,Math.min(100,Number(progress)||0))+'%';
    if(demoMode){note('예시로 작동을 확인하는 화면입니다. 실제 게임 영상이 아니며 결과도 가상 데이터입니다.');}
    else if(legacy)note(legacy);
    if(demoMode){ui.state.textContent='가상 예시 · 시연 완료';ui.light.className='one-status-light done';ui.progress.style.width='100%';ui.stop.disabled=true;}
    else if(scanActive){
      ui.state.textContent='자동 분석 중 · '+(Number(progress)||0)+'%';
      ui.light.className='one-status-light';ui.stop.disabled=false;
    }else if(scanFinished){
      if(/실패|오류/.test(legacy)){
        ui.state.textContent='분석 오류';ui.light.className='one-status-light error';
      }else if(/중지/.test(legacy)){
        ui.state.textContent='분석 중지됨';ui.light.className='one-status-light';
      }else{
        ui.state.textContent='분석 완료';ui.light.className='one-status-light done';
        ui.progress.style.width='100%';
      }
      ui.stop.disabled=true;
    }
    if(demoMode){ui.conclusion.textContent='가상 예시 결과입니다. 실제 영상에서 채팅이 감지되는지를 검증한 결과가 아닙니다.';}
    else if(findings.length){
      ui.conclusion.textContent='의심 표현 '+findings.length+'건을 찾았습니다. 목록을 누르면 해당 장면으로 이동할 수 있습니다. 실제 고의성은 영상 맥락을 확인해야 합니다.';
    }else if(scanFinished&&stats.total){
      ui.conclusion.textContent='인식된 문장 '+stats.total+'줄 중 설정된 의심 표현이 검출되지 않았습니다. 정상 플레이를 확정하는 결과는 아닙니다.';
    }else if(scanFinished&&!stats.total){
      ui.conclusion.textContent='인식된 채팅이 없습니다. 영상에 채팅이 표시되었는지 확인하고, 필요하면 아래에서 채팅 영역을 변경해 재분석해 주세요.';
      if(ui.help&&!ui.help.open)ui.help.open=true;
    }else ui.conclusion.textContent='분석 도중에도 채팅 로그와 의심 문구가 자동으로 누적됩니다.';
    const fingerprint=[chat.length,findings.length,viewFilter,chat[chat.length-1]?.text,findings[findings.length-1]?.fact].join('|');
    if(lastKey!==fingerprint){
      lastKey=fingerprint;
      renderLogs(chat);renderFindings(findings);
    }
  }
  setInterval(render,450);
  render();
})();