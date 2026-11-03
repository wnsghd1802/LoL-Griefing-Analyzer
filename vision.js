/* Local, model-free video frame-change screening. It cannot determine intent, champion actions or AFK. */
(function(root){
 'use strict';
 function measure(image){
   if(!image || !image.data || !(image.width>0) || !(image.height>0)) throw Error('영상 화면 정보가 없습니다.');
   const {width:w,height:h,data}=image, points=[];
   // Ignore most of the HUD, subtitles, chat and the minimap; use the game scene center.
   for(let y=Math.floor(h*.16);y<Math.floor(h*.77);y+=2){
     for(let x=Math.floor(w*.15);x<Math.floor(w*.85);x+=2){
       const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];
       points.push([r,g,b]);
     }
   }
   let chroma=0,brightness=0;
   for(const p of points){chroma+=Math.max(...p)-Math.min(...p);brightness+=(p[0]*.2126+p[1]*.7152+p[2]*.0722);}
   return {chroma:chroma/points.length,brightness:brightness/points.length,pixels:points};
 }
 function difference(a,b){
   if(!a || !b || !Array.isArray(a.pixels)||a.pixels.length!==b.pixels.length)return Infinity;
   let sum=0;
   for(let i=0;i<a.pixels.length;i++){
     const x=a.pixels[i],y=b.pixels[i];sum+=Math.abs(x[0]-y[0])+Math.abs(x[1]-y[1])+Math.abs(x[2]-y[2]);
   }
   return sum/(a.pixels.length*3);
 }
 function percentiles(values,p){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];}
 // Only label visual changes, never conclude that the player died or went AFK.
 function analyze(samples,options={}){
   if(!Array.isArray(samples)||samples.length<3)return [];
   const step=Number(options.step)||20;
   const baseline=percentiles(samples.filter(s=>s.brightness>30).map(s=>s.chroma),.8);
   const usable=samples.filter(s=>s.brightness>28 && Number.isFinite(s.chroma));
   if(!usable.length)return [];
   const grayThreshold=Math.min(16,baseline*.47);
   const flags=[];
   if(baseline>=26){
     let run=[];
     function finish(){if(run.length>=2){const first=run[0],last=run[run.length-1];flags.push({at:Math.round(first.at),end:Math.round(last.at+step),source:'영상 화면 분석',category:'화면 색상 변화',title:'화면이 흑백에 가깝게 바뀐 구간',rule:'visual-grayscale',fact:`${Math.round(first.at)}~${Math.round(last.at+step)}초 사이 영상 화면의 색이 크게 줄었습니다. 사망 화면 등인지 직접 확인해야 합니다.`,alternative:'사망 장면 외에도 편집 효과, 리플레이 화면, 원래 어두운 장면일 수 있습니다.',detail:'화면 색상만 분석 · 사망 여부와 고의성은 판단하지 않음'});}run=[];}
     for(const s of samples){if(s.brightness>28 && s.chroma<grayThreshold)run.push(s);else finish();}finish();
   }
   // A completely static screen is worth checking for video pause/capture malfunction,
   // but not proof that the champion stopped moving. Deliberately exclude the AFK label.
   let still=[];
   function flush(){if(still.length>=3){const first=still[0],last=still[still.length-1];flags.push({at:Math.round(first.at),end:Math.round(last.at),source:'영상 화면 분석',category:'화면 정지',title:'영상 화면 변화가 거의 없는 구간',rule:'visual-still',fact:`${Math.round(first.at)}~${Math.round(last.at)}초 사이 화면 변화가 거의 없습니다. 녹화 문제나 정지 화면인지 확인해 주세요.`,alternative:'게임 플레이 중의 AFK를 의미하지 않습니다. 화면 일시정지·녹화 오류·고정 화면이 원인일 수 있습니다.',detail:'영상 프레임 차이만 측정 · 캐릭터 이동 여부와 무관'});}still=[];}
   for(let i=1;i<samples.length;i++){
     const prev=samples[i-1],curr=samples[i];
     if(curr.brightness>28 && prev.brightness>28 && curr.delta<2.5){if(!still.length)still.push(prev);still.push(curr);}else flush();
   }flush();
   return flags.slice(0,100);
 }
 const API={measure,difference,analyze};
 if(typeof module==='object' && module.exports)module.exports=API;
 root.PlayCheckVision=API;
})(typeof window!=='undefined'?window:globalThis);
