/* Deterministic candidate extraction from Riot Match-V5 timeline, not a punishment classifier. */
(function(root){
 'use strict';
 const LIMIT=80;
 function analyzeTimeline(raw, options={}){
   if(!raw || !Array.isArray(raw.info?.frames) || raw.info.frames.length<2) throw Error('Riot Match-V5 타임라인 JSON의 info.frames 배열이 필요합니다.');
   const frames=raw.info.frames;
   const ids=new Set();
   const positions=new Map();
   const cs=new Map();
   const deaths=new Map();
   const findings=[];
   const jungleId=String(options.jungleId??'');
   const threshold=Number(options.csRate??5);
   if(!Number.isFinite(threshold)||threshold<0||threshold>30)throw Error('CS 비교값이 올바르지 않습니다.');
   const frameRecord=(frame,id)=>frame.participantFrames?.[id]??Object.values(frame.participantFrames??{}).find(p=>String(p?.participantId)===String(id));
   for(const f of frames){
     const ts=Number(f.timestamp);
     if(!Number.isFinite(ts)||ts<0)continue;
     for(const [key,p] of Object.entries(f.participantFrames??{})){
       const id=String(p?.participantId??key);
       ids.add(id);
       const m=Number(p?.minionsKilled);
       if(Number.isFinite(m)&&m>=0){
          if(!cs.has(id))cs.set(id,[]);
          cs.get(id).push({ts,cs:m});
       }
       if(Number.isFinite(Number(p?.position?.x))&&Number.isFinite(Number(p?.position?.y))){
         const x=Number(p.position.x), y=Number(p.position.y);
         if(x>=0&&y>=0){if(!positions.has(id))positions.set(id,[]);positions.get(id).push({ts,x,y});}
       }
     }
     for(const e of f.events??[]){
       if(e?.type!=='CHAMPION_KILL')continue;
       const id=String(e.victimId??'');
       const at=Number(e.timestamp??f.timestamp);
       if(!/^\d+$/.test(id)||!Number.isFinite(at))continue;
       if(!deaths.has(id))deaths.set(id,[]);
       deaths.get(id).push(at);
     }
   }
   const knownIds=[...ids].sort((a,b)=>Number(a)-Number(b));
   const push=(x)=>{findings.push({status:'검토 필요',source:'경기 타임라인',...x});};
   // Death bursts: review signal only. No judgment of intent or whether kill trades were worthwhile.
   for(const [id,times0] of deaths){
     const times=[...new Set(times0)].sort((a,b)=>a-b);
     let lastFlagEnd=-1;
     for(let i=0;i<times.length;i++){
       let j=i;
       while(j<times.length&&times[j]-times[i]<=5*60000)j++;
       if(j-i>=3 && times[i]>lastFlagEnd){
         const within=times.slice(i,j);
         push({category:'고의적 사망 의심',at:times[i]/1000,participantId:id,title:`참가자 ${id} · 사망 집중 구간`,fact:`약 5분 동안 사망 ${within.length}회가 기록되었습니다.`,alternative:'반복 교전·상대 실력·포지션·아군 합류 여부 등 정상적인 경기 맥락 확인 필요',rule:'사망 집중',detail:`${within.map(t=>Math.round(t/1000)).join(', ')}초`});
         lastFlagEnd=times[j-1];i=j-1;
       }
     }
   }
   // Stationarity only from coarse 1-minute frames; check whether dead/fountain before any interpretation.
   for(const [id,pts] of positions){
     let start=0;
     let flaggedTo=-1;
     for(let i=1;i<pts.length;i++){
       const prev=pts[i-1], cur=pts[i];
       const d=Math.hypot(cur.x-prev.x,cur.y-prev.y);
       const dt=cur.ts-prev.ts;
       if(d>180||dt<=0||dt>150000)start=i;
       if(i-start>=2 && cur.ts-pts[start].ts>=180000 && pts[start].ts>90000 && cur.ts>flaggedTo){
         push({category:'반복적인 무활동',at:pts[start].ts/1000,participantId:id,title:`참가자 ${id} · 위치 변화 적은 구간`,fact:`타임라인 프레임상 약 ${Math.round((cur.ts-pts[start].ts)/60000)}분 동안 위치 변화가 작았습니다.`,alternative:'사망 후 부활 대기, 기지 체류, 연결 문제, 타임라인 표본 간격을 확인해야 합니다.',rule:'위치 변화 감소',detail:'분 단위 위치 표본으로 감지하므로 프레임 사이 움직임은 확인할 수 없음'});
         flaggedTo=cur.ts+180000;start=i;
       }
     }
   }
   // Lane CS only when a human explicitly supplies the jungler participantId.
   if(jungleId && knownIds.includes(jungleId)){
     const series=cs.get(jungleId)??[];
     const csFindings=[];
     for(let i=1;i<series.length;i++){
       const a=series[i-1],b=series[i], dt=(b.ts-a.ts)/60000,delta=b.cs-a.cs;
       if(dt<=0||dt>5||delta<0)continue;
       const rate=delta/dt;
       if(rate>=threshold && b.ts>=4*60000){
         csFindings.push({category:'자원·CS 방해 의심',at:a.ts/1000,participantId:jungleId,title:`정글러 ${jungleId} · 일반 미니언 획득 집중`,fact:`${(a.ts/60000).toFixed(1)}–${(b.ts/60000).toFixed(1)}분 구간, 일반 미니언 +${delta}개 (${rate.toFixed(1)}개/분).`,alternative:'라이너 부재 시 웨이브 정리, 함께 푸시, 타워 수비, 동의된 자원 배분일 가능성이 있습니다.',rule:'일반 미니언 집중',detail:'minionsKilled 변화량이며 특정 라이너의 미니언을 고의로 빼앗았다는 뜻이 아님'});
       }
     }
     for(const f of csFindings.sort((a,b)=>Number(b.fact.match(/\(([\d.]+)개\/분\)/)?.[1]??0)-Number(a.fact.match(/\(([\d.]+)개\/분\)/)?.[1]??0)).slice(0,15))push(f);
   }
   return {participants:knownIds,findings:findings.sort((a,b)=>a.at-b.at).slice(0,LIMIT),meta:{frames:frames.length,matchId:raw.metadata?.matchId??null,jungleRoleProvided:Boolean(jungleId&&knownIds.includes(jungleId)),threshold}};
 }
 function classifyOCR(text){
   const t=String(text??'').replace(/\s+/g,' ').trim();
   if(!t)return [];
   let labels=[];
   if(/(?:오픈\s*(?:함|해|한다|할게|하자|할거|하겠)|(?:겜|게임)\s*(?:안\s*해|포기|안\s*함)|던진다|던짐|고의로\s*(?:죽|던)|나\s*안\s*함|open\s*(?:mid|top|bot)|\bafk\b)/i.test(t))labels.push('게임 포기·방해 선언 후보');
   if(/(?:시발|씨발|ㅅㅂ|병신|ㅂㅅ|개새끼|닥쳐|꺼져|\b(?:idiot|stupid|trash|moron|retard|fuck|useless|loser)\b)/i.test(t))labels.push('공격적 표현 후보');
   return labels;
 }
 const API={analyzeTimeline,classifyOCR};
 if(typeof module!=='undefined'&&module.exports)module.exports=API;
 root.PlayCheckHeuristics=API;
})(typeof window!=='undefined'?window:globalThis);
