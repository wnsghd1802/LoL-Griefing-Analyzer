'use strict';
const vm=require('vm'),fs=require('fs'),assert=require('assert');
const root=require('../heuristics.js');
const path=require('path');
const base=path.resolve(__dirname,'..')+path.sep;
const video={duration:4,currentTime:0,paused:true,readyState:4,pause(){}};
const elements=new Map();
const defaults={'#autoStart':'0','#autoEnd':'','#autoStep':'4','#autoCrop':'left-bottom','#ocrCrop':'left-bottom','#ocrReadableCount':'0','#autoCsRate':'5','#autoJungleId':'','#autoVideoStatus':''};
function elem(sel){if(!elements.has(sel)){elements.set(sel,{value:defaults[sel]??'',textContent:defaults[sel]??'',disabled:false,style:{},dataset:{},innerHTML:'',setAttribute(){},replaceChildren(){},querySelectorAll(){return []}});}return elements.get(sel);}
const worker={recognize:async()=>({data:{text:'(채팅) 오픈함\n아군: 다음 용 같이 가자',confidence:93}})};
const bridge={formatTime:s=>`00:0${Math.floor(s)}`,notify(){},renderReport(){},video,hasVideo:()=>true,
 ensureOCR:async()=>worker,frameCanvas:()=>({style:{}}),setVideoTime:async at=>{video.currentTime=at},addEvent(){},
 analyzeChat(){},tab(){}};
const context={window:{PlayCheckBridge:bridge,PlayCheckHeuristics:root},document:{querySelector:elem},setTimeout,clearTimeout,console};
vm.createContext(context);
vm.runInContext(fs.readFileSync(base+'auto.js','utf8'),context);
(async()=>{
  assert(root.classifyOCR('오 픈 함').includes('게임 포기·방해 선언 후보'));
  assert(root.classifyOCR('ㅅ ㅂ').includes('공격적 표현 후보'));
  assert.deepStrictEqual(root.classifyOCR('다음 용 같이 가자'),[]);
  await context.window.PlayCheckAuto.scanVideo();
  assert.equal(context.window.PlayCheckAuto.snapshot().length,1);
  assert(context.window.PlayCheckAuto.snapshot()[0].fact.includes('오픈함'));
  assert(elem('#autoVideoStatus').textContent.includes('부적절한 표현 후보 1건'));
  assert(elem('#ocrRawPreview').textContent.includes('오픈함'));
  console.log('PASS: OCR 추출 및 분류/시각 기록/사용자 진단 화면 연동');
})().catch(e=>{console.error(e);process.exit(1)});
