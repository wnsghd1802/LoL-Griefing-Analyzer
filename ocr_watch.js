(() => {
  'use strict';
  const $=q=>document.querySelector(q);
  const video=$('#video'),button=$('#liveWatchToggle'),status=$('#liveWatchStatus');
  const bridge=window.PlayCheckBridge,rules=window.PlayCheckHeuristics;
  let enabled=true,blocked=false,busy=false,lastAt=-10,checked=0,hits=0,readable=0,consecutiveErrors=0;
  const seen=new Map();
  function say(message){if(status)status.textContent=message;}
  function latestCanvas(c){
    const place=$('#ocrCropPreview');if(!place||!c)return;
    c.style.cssText='display:block;max-width:100%;width:100%;height:auto;border-radius:8px;';
    place.replaceChildren(c);
  }
  function activate(on){
    enabled=Boolean(on);
    if(button){button.textContent=enabled?'● 재생 중 채팅 감시: 켜짐':'○ 재생 중 채팅 감시: 꺼짐';button.setAttribute('aria-pressed',String(enabled));}
    say(enabled?'재생 중 채팅 감시가 켜져 있습니다. 영상을 재생하면 OCR을 시작합니다.':'감시 중지됨. 전체 영상 분석 버튼은 별도로 사용할 수 있습니다.');
  }
  async function inspect(){
    if(!enabled||blocked||busy||video.paused||video.ended||!bridge.hasVideo()||video.readyState<2)return;
    if(window.PlayCheckAuto?.isScanning?.())return;
    let at=Number(video.currentTime);
    if(!Number.isFinite(at)||Math.abs(at-lastAt)<1.1)return;
    busy=true;
    try{
      say('재생 중 '+bridge.formatTime(at)+' 화면에서 채팅 읽는 중… 첫 실행은 한국어 OCR 다운로드가 필요합니다.');
      const crop=$('#autoCrop')?.value||'left-bottom';
      if($('#ocrCrop'))$('#ocrCrop').value=crop;
      const worker=await bridge.ensureOCR();
      if(blocked||video.paused)return;
      at=Number(video.currentTime);lastAt=at;
      let canvas=bridge.frameCanvas();
      let result=await worker.recognize(canvas);
      let raw=String(result.data?.text||'').trim();
      let candidates=rules.extractOCRCandidates(raw);
      if(!candidates.length && raw.length<12){
        const enhanced=bridge.frameCanvas('contrast');
        const second=await worker.recognize(enhanced);
        const alt=String(second.data?.text||'').trim();
        const altCandidates=rules.extractOCRCandidates(alt);
        if(altCandidates.length||(!raw&&alt)){raw=alt;candidates=altCandidates;canvas=enhanced;result=second;}
      }
      checked++;
      if(raw.length>=2)readable++;
      latestCanvas(canvas);
      if($('#ocrReadableCount'))$('#ocrReadableCount').textContent=String(readable);
      if($('#ocrRawPreview'))$('#ocrRawPreview').textContent=raw?bridge.formatTime(at)+' · '+raw.slice(0,900):'이 시점에서 글자를 읽지 못했습니다.';
      if($('#ocrDebugHelp'))$('#ocrDebugHelp').textContent='재생 중 확인 화면 '+checked+'개 · 글자 인식 '+readable+'개 · 의심 표현 '+hits+'건. 아래 잘린 화면에 채팅이 보여야 합니다.';
      const fresh=[];
      for(const c of candidates){
        const key=(c.labels.join('/')+c.snippet).normalize('NFKC').toLowerCase().replace(/[^\p{L}\d]/gu,'').slice(0,120);
        if(key.length<4)continue;
        const prev=seen.get(key);
        if(prev!==undefined&&at-prev<60)continue;
        seen.set(key,at);
        fresh.push({source:'재생 중 OCR',at,category:c.labels.join(' / '),title:c.labels[0],rule:'재생 중 채팅 문구',fact:'영상에 나타난 채팅 OCR: “'+c.snippet+'”',alternative:'OCR 오인식·인용·농담 가능성이 있어 영상과 맥락을 다시 확인해야 합니다.',detail:'영상 재생 중 자동 검색 · 문자 인식 결과'});
      }
      if(fresh.length){
        window.PlayCheckAuto?.addOCRFindings?.(fresh);
        hits+=fresh.length;
      }
      consecutiveErrors=0;
      say('재생 중 채팅 감시 · 화면 '+checked+'개 확인 · 글자 '+readable+'개 화면 · 의심 표현 '+hits+'건'+(fresh.length?' · 방금 '+fresh.length+'건 발견!':''));
    }catch(error){
      consecutiveErrors++;
      say('채팅 감시 오류: '+String(error.message||error));
      if(consecutiveErrors>=3){activate(false);say('OCR 오류가 반복되어 감시를 중지했습니다: '+String(error.message||error));}
    }finally{busy=false;}
  }
  async function pauseForScan(){
    blocked=true;video.pause();
    if(!busy)return;
    await new Promise((resolve,reject)=>{
      const started=Date.now();
      const timer=setInterval(()=>{
        if(!busy){clearInterval(timer);resolve();}
        else if(Date.now()-started>30000){clearInterval(timer);reject(Error('재생 중 OCR 작업이 끝나지 않았습니다. 다시 시도해 주세요.'));}
      },100);
    });
  }
  function resumeAfterScan(){blocked=false;if(enabled)say('전체 분석이 끝났습니다. 영상을 재생하면 채팅 감시를 이어갑니다.');}
  button?.addEventListener('click',()=>activate(!enabled));
  video.addEventListener('loadedmetadata',()=>{lastAt=-10;checked=0;hits=0;readable=0;seen.clear();if(enabled)say('영상을 재생하면 화면 속 채팅을 자동 확인합니다.');});
  video.addEventListener('play',()=>{if(enabled&&!blocked){lastAt=-10;inspect();}});
  video.addEventListener('ended',()=>{if(enabled)say('영상 재생 종료 · 채팅 확인 '+checked+'개 화면 · 의심 표현 '+hits+'건');});
  setInterval(inspect,950);
  window.PlayCheckLiveOCR={pauseForScan,resumeAfterScan,isBusy:()=>busy,isEnabled:()=>enabled};
})();