(() => {
'use strict';
const $=q=>document.querySelector(q);
const nick=$('#oneRiotId'),lookup=$('#oneLookup'),help=$('#oneRiotHelp');
const upload=$('#oneScoreFile'),status=$('#oneScoreStatus'),resultBox=$('#oneScoreResults'),summary=$('#oneScoreSummary'),list=$('#oneScoreRows'),rawOutput=$('#oneScoreRaw');
let busy=false,worker=null;
let last={imageName:'',ocrText:'',candidates:[],focus:null,error:''};
const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/[\s#:_|.-]/g,'');
function riotId(){
 const raw=String(nick?.value||'').trim(),at=raw.lastIndexOf('#');
 if(at<1||at===raw.length-1)return null;
 const gameName=raw.slice(0,at).trim(),tagLine=raw.slice(at+1).trim();
 if(!gameName||!tagLine||gameName.length>45||tagLine.length>12||/[\/\?#]/.test(gameName+tagLine))return null;
 return {gameName,tagLine};
}
function opggUrl(id){
 return 'https://op.gg/ko/lol/summoners/kr/'+encodeURIComponent(id.gameName)+'-'+encodeURIComponent(id.tagLine)+'/matches';
}
lookup?.addEventListener('click',()=>{
 const id=riotId();
 if(!id){help.textContent='라이엇 ID를 이름#태그 형식으로 입력해 주세요. 예: Hide on bush#KR1';nick.focus();return;}
 help.textContent='전적 페이지를 새 탭에서 엽니다. 실제 전적 데이터를 자동 수집하는 기능은 아닙니다.';
 window.open(opggUrl(id),'_blank','noopener,noreferrer');
});
function scoreFromLine(s){
 const m=String(s).match(/(?:^|[^\d])(\d{1,2})\s*[/／|]\s*(\d{1,2})\s*[/／|]\s*(\d{1,2})(?=$|[^\d])/);
 if(!m)return null;
 const kills=Number(m[1]),deaths=Number(m[2]),assists=Number(m[3]);
 return Math.max(kills,deaths,assists)>65?null:{kills,deaths,assists};
}
function csFromLine(s){
 const text=String(s);
 let m=text.match(/(?:\bCS\b|미니언|Minions?|creep\s*score)\s*[:：]?\s*(\d{1,3})(?!\d)/i);
 if(!m)m=text.match(/(?:^|\s)(\d{1,3})\s*(?:CS\b|미니언)\b/i);
 return m&&Number(m[1])<=700?Number(m[1]):null;
}
function wordLines(words){
 if(!Array.isArray(words)||words.length<5)return [];
 const values=words.filter(w=>w&&String(w.text||'').trim()&&w.bbox&&Number.isFinite(Number(w.bbox.y0)))
 .map(w=>({text:String(w.text).trim(),x:Number(w.bbox.x0),y:(Number(w.bbox.y0)+Number(w.bbox.y1))/2,h:Math.max(3,Number(w.bbox.y1)-Number(w.bbox.y0))}))
 .sort((a,b)=>a.y-b.y||a.x-b.x);
 if(values.length<5)return [];
 const hs=values.map(w=>w.h).sort((a,b)=>a-b),limit=Math.max(8,Math.min(30,hs[Math.floor(hs.length/2)]*.75));
 const groups=[];
 for(const word of values){
  let row=groups.find(r=>Math.abs(r.y-word.y)<limit);
  if(!row){row={y:word.y,words:[]};groups.push(row);}
  row.words.push(word);row.y=row.words.reduce((s,w)=>s+w.y,0)/row.words.length;
 }
 return groups.sort((a,b)=>a.y-b.y).map(r=>r.words.sort((a,b)=>a.x-b.x).map(w=>w.text).join(' '));
}
function parseStatsText(raw,requested='',words=[]){
 const textLines=String(raw||'').split(/\r?\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length>=2);
 const positioned=wordLines(words);
 const lines=positioned.length>textLines.length/3?positioned:textLines;
 const needle=normalize(String(requested||'').split('#')[0]);
 const candidates=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i],kda=scoreFromLine(line);
  if(!kda)continue;
  const surrounding=[lines[i-1]||'',line,lines[i+1]||''].join(' ');
  let cs=csFromLine(line);
  if(cs===null&&lines[i+1]&&!scoreFromLine(lines[i+1]))cs=csFromLine(lines[i+1]);
  if(cs===null&&lines[i-1]&&!scoreFromLine(lines[i-1]))cs=csFromLine(lines[i-1]);
  const nameContext=normalize(line).includes(needle)||((lines[i-1]&&!scoreFromLine(lines[i-1]))&&normalize(lines[i-1]).includes(needle));
  const matched=needle.length>=2&&Boolean(nameContext);
  candidates.push({...kda,cs,matched,line:line.slice(0,250),context:surrounding.slice(0,380)});
 }
 const matching=candidates.filter(c=>c.matched);
 const focus=matching.length===1?matching[0]:(candidates.length===1?candidates[0]:null);
 return {candidates,focus,ambiguous:candidates.length>1&&!focus};
}
function el(tag,cls,value){
 const node=document.createElement(tag);if(cls)node.className=cls;
 if(value!==undefined)node.textContent=String(value);
 return node;
}
function render(parsed){
 if(!resultBox)return;
 resultBox.hidden=false;summary.replaceChildren();list.replaceChildren();
 const focus=parsed.focus;
 if(focus){
  summary.append(el('div','one-score-subheading',focus.matched?'닉네임과 일치하는 점수 후보':'이미지에서 읽힌 점수 후보'));
  const grid=el('div','one-score-metrics');
  for(const pair of [['킬',focus.kills],['데스',focus.deaths],['어시스트',focus.assists],['CS',focus.cs===null?'확인 불가':focus.cs]]){
   const cell=el('div','one-score-metric');cell.append(el('small','',pair[0]),el('strong','',pair[1]));grid.append(cell);
  }
  summary.append(grid);
 }else if(parsed.candidates.length){
  summary.append(el('p','one-score-uncertain','선수 '+parsed.candidates.length+'명의 KDA 후보를 찾았습니다. 이미지에 닉네임이 보이지 않아 해당 플레이어의 점수를 임의로 고르지 않았습니다.'));
 }else summary.append(el('p','one-score-uncertain','인식 가능한 K/D/A 형식을 찾지 못했습니다. 점수표가 크게 보이도록 캡처해 주세요.'));
 for(const c of parsed.candidates.slice(0,16)){
  const row=el('div','one-score-row'+(c.matched?' matched':''));
  row.append(el('strong','',String(c.kills)+'/'+String(c.deaths)+'/'+String(c.assists)));
  row.append(el('span','',c.cs===null?'CS 미인식':'CS '+String(c.cs)));
  row.append(el('span','one-score-row-context',c.line));list.append(row);
 }
 if(!parsed.candidates.length)list.append(el('div','one-score-row-muted','추출한 점수가 없습니다.'));
 rawOutput.textContent=last.ocrText.slice(0,16000)||'인식된 문자가 없습니다.';
}
async function getWorker(){
 if(worker)return worker;
 if(!window.Tesseract){
  status.textContent='OCR 글자 인식 라이브러리를 준비합니다…';
  await new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
   script.onload=resolve;script.onerror=()=>reject(Error('OCR 라이브러리를 불러오지 못했습니다.'));
   document.head.append(script);
  });
 }
 status.textContent='한국어·영어 인식 모델을 내려받는 중입니다…';
 worker=await window.Tesseract.createWorker(['kor','eng'],1,{
  logger:m=>{if(m.status==='recognizing text')status.textContent='전적표 인식 중 · '+Math.round((m.progress||0)*100)+'%';}
 });
 await worker.setParameters({tessedit_pageseg_mode:'11'});
 return worker;
}
async function getBitmap(file){
 if(typeof createImageBitmap==='function')return await createImageBitmap(file);
 const objectUrl=URL.createObjectURL(file);
 try{
  return await new Promise((resolve,reject)=>{
   const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('이미지를 불러오지 못했습니다.'));img.src=objectUrl;
  });
 }finally{URL.revokeObjectURL(objectUrl);}
}
async function readImage(file){
 if(busy){status.textContent='이미 전적표를 분석 중입니다.';return;}
 if(!file||!/^image\/(png|jpeg|webp|bmp)$/i.test(file.type||'')){status.textContent='PNG·JPG·WebP 전적표 이미지를 선택하세요.';return;}
 if(file.size>18*1024*1024){status.textContent='18MB 이하 이미지가 필요합니다.';return;}
 busy=true;status.textContent='전적표 화면을 읽는 중…';
 try{
  const bitmap=await getBitmap(file),width=bitmap.width,height=bitmap.height;
  if(!width||!height)throw Error('이미지 크기를 읽지 못했습니다.');
  const scale=Math.min(2,3000/width,2500/height);
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close?.();
  const engine=await getWorker(),result=await engine.recognize(canvas);
  const data=result.data||{},raw=String(data.text||'');
  const parsed=parseStatsText(raw,nick?.value||'',data.words||[]);
  last={imageName:file.name,ocrText:raw,candidates:parsed.candidates,focus:parsed.focus,error:''};
  render(parsed);
  const info=parsed.focus?'KDA '+parsed.focus.kills+'/'+parsed.focus.deaths+'/'+parsed.focus.assists+' · CS '+(parsed.focus.cs??'미인식'):parsed.candidates.length+'개 점수 후보';
  status.textContent=file.name+' · OCR 추출: '+info+' (원본 이미지와 대조 필요)';
 }catch(e){
  last.error=String(e.message||e);
  status.textContent='전적표 글자 인식 오류: '+last.error;
  resultBox.hidden=false;summary.textContent='전적표를 분석하지 못했습니다. 파일 형식·인터넷 연결을 확인해 주세요.';list.replaceChildren();
 }finally{busy=false;}
}
upload?.addEventListener('change',e=>{const file=e.target.files?.[0];if(file)readImage(file);});
nick?.addEventListener('change',()=>{
 if(!last.ocrText)return;
 const parsed=parseStatsText(last.ocrText,nick.value);
 last.candidates=parsed.candidates;last.focus=parsed.focus;render(parsed);
});
window.PlayCheckScorecard={parseStatsText,scoreFromLine,csFromLine,opggUrl,riotId,snapshot:()=>({imageName:last.imageName,candidates:last.candidates.map(v=>({...v})),focus:last.focus?{...last.focus}:null,error:last.error})};
})();