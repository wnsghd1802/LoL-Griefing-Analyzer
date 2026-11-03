(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const RULES = [
    {id:'VERBAL',title:'언어적 공격·위협',signals:'반복적 모욕, 심각한 위협, 차별적 표현 등',context:'원문·전후 채팅·대상·반복 여부',counter:'인용문·농담·상황 설명·오인식된 OCR 문구',avoid:'비속어 한 단어만으로 게임 포기 의도까지 확정하지 않기'},
    {id:'QUIT',title:'포기 선언 이후 실제 방해',signals:'오픈·포기 선언에 이어 방어·전투를 의도적으로 회피하는 정황',context:'선언 시점 전후 행동 변화, 항복 여부, 승리 가능성',counter:'감정 표현에 그침, 이후에도 정상 참여함, 전략적 철수',avoid:'"오픈" 문자만으로 실제 방해를 입증하지 않기'},
    {id:'FEED',title:'고의적 사망 의심',signals:'전투 의도 없이 적에게 반복적으로 접근하여 사망하는 장면',context:'적 위치·아이템·체력·전투 상황·반복성',counter:'실력 부족, 시야 부재, 불리한 교전, 진입 실패',avoid:'높은 데스 수 또는 낮은 KDA만으로 고의성 판단하지 않기'},
    {id:'AFK',title:'장시간 무활동·참여 거부',signals:'전투·이동·방어에 지속적으로 참여하지 않는 장면',context:'지속 시간, 반복성, 채팅, 재접속, 서버 상태',counter:'통신 장애, 클라이언트 오류, 현실적 긴급 상황',avoid:'짧은 정지나 단일 이탈을 고의적 방해로 단정하지 않기'},
    {id:'RES',title:'의도적 자원 획득 방해',signals:'특정 팀원의 미니언·정글 몬스터를 반복적으로 가로채 성장을 방해하는 정황',context:'구간별 CS, 라이너 생존·위치, 웨이브 상태, 상대 위치',counter:'타워 방어, 라인 커버, 정상적인 웨이브 정리, 합의된 분배',avoid:'정글러의 라인 CS가 높다는 사실만으로 탈취 확정하지 않기'},
    {id:'OBJ',title:'승리 목표 회피·방어 이탈',signals:'넥서스 위기나 중요한 교전에서 반복적으로 비합리적 이탈이 관찰됨',context:'기지 위협, 순간이동, 챔피언 특성, 적 위치, 오브젝트 교환',counter:'백도어·스플릿푸시, 우회, 시간 벌기, 방어 불가능 판단',avoid:'합류하지 않았다는 한 장면만으로 의도 판단하지 않기'},
    {id:'SAB',title:'고의적인 스킬·아이템 방해 의심',signals:'정상 경기 목표와 무관하게 주요 스킬 낭비·아이템 매각을 반복하는 장면',context:'재사용 대기시간, 상황, 구매 패턴, 전후 플레이',counter:'실수, 전략 실험, 아이템 변경, 비주류 빌드',avoid:'비주류 챔피언·아이템 자체를 제재 근거로 삼지 않기'},
    {id:'HARASS',title:'반복 표적 방해·괴롭힘',signals:'특정 팀원의 플레이를 가로막거나 행동을 반복적으로 방해하는 정황',context:'대상 선택의 반복성, 공간·스킬·자원 간섭, 채팅',counter:'협동 플레이, 초보 실수, 우발적 동선 중복',avoid:'한 번의 동선 충돌로 악의 확정하지 않기'},
    {id:'OTHER',title:'기타 · 신규 유형',signals:'기존 분류에 포함되지 않는 새로운 방해 의심 행동',context:'발생 전후 시점, 복수 근거, 행동의 실제 효과',counter:'일반적인 전략 차이, 관찰 정보의 부족',avoid:'명칭을 붙이는 것보다 객관적 관찰 내용 먼저 작성'}
  ];
  let cases = [];
  const runTime = n => { const m=Math.floor(n/60),s=n%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
  const getRule = id => RULES.find(r=>r.id===id) || RULES[RULES.length-1];
  function showRule(){const r=getRule($('ruleSelect').value);$('ruleDetail').innerHTML=`<div class="rule-heading"><span class="pill">${esc(r.id)}</span><h4>${esc(r.title)}</h4></div><dl><dt>검토할 관찰 신호</dt><dd>${esc(r.signals)}</dd><dt>반드시 확인할 맥락</dt><dd>${esc(r.context)}</dd><dt>고려해야 할 반례</dt><dd>${esc(r.counter)}</dd><dt>잘못된 판단 방지</dt><dd>${esc(r.avoid)}</dd></dl>`;}
  function getChecks(){ return {video:$('eVideo').checked,repeat:$('eRepeat').checked,context:$('eContext').checked,chat:$('eChat').checked,alternativeReviewed:$('eAlt').checked}; }
  function seconds(raw){ if(!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(raw))return null;const p=raw.split(':').map(Number);if(p.some((v,i)=>i>0&&v>=60))return null;return p.reduce((a,b)=>a*60+b,0); }
  // Completeness is not a probability of intent or a punishment recommendation.
  function evidenceStatus(item){const e=item.checks;
    if(!item.fact||item.at===null)return '자료 부족 · 시간/관찰 사실 보완';
    if(!e.video)return '직접 관찰 근거 확인 필요';
    if(!e.context||!e.alternativeReviewed||!item.alternative)return '판단 보류 · 맥락/반례 검토';
    if(e.repeat||e.chat)return '다각도 근거 기록됨 · 사람 검토';
    return '기본 근거 기록됨 · 추가 확인';
  }
  function validateAndAdd(){ const fact=$('caseFact').value.trim(),alternative=$('caseAlt').value.trim(),raw=$('caseTime').value.trim(),at=seconds(raw),url=$('caseUrl').value.trim(),type=$('caseType').value,src=$('caseSource').value;
    if(!fact){error('영상에서 직접 관찰한 사실을 작성해 주세요.');return;}
    if(at===null){error('시점을 MM:SS 또는 HH:MM:SS 형식으로 입력해 주세요.');return;}
    if(url){try{const p=new URL(url);if(!['https:','http:'].includes(p.protocol))throw Error('protocol');}catch(_){error('링크는 올바른 http 또는 https URL이어야 합니다.');return;}}
    const item={id:'CASE-'+Date.now()+'-'+Math.floor(Math.random()*10000),type,source:src,url,at,time:raw,fact,alternative,checks:getChecks(),origin:'사용자 기록'};
    cases.push(item);render();['caseFact','caseAlt','caseUrl','caseTime'].forEach(id=>$(id).value='');['eVideo','eRepeat','eContext','eChat','eAlt'].forEach(id=>$(id).checked=false);error('공통 기준으로 사건을 기록했습니다.',false);
  }
  function error(message,isError=true){ const element=$('feedback'); element.hidden=false;element.className='feedback'+(isError?' error':'');element.textContent=message; }
  function render(){ $('caseCount').textContent=String(cases.length);const box=$('caseList');
    if(!cases.length){box.className='case-list results-empty';box.textContent='아직 기록된 사건이 없습니다. 위 양식에 입력하거나 다양한 가상 사례를 불러오세요.';return;}
    box.className='case-list';box.innerHTML=cases.map(x=>{const rule=getRule(x.type);const badges=Object.entries(x.checks).filter(([_,v])=>v).map(([k])=>({'video':'영상 확인','repeat':'반복 확인','context':'맥락 확인','chat':'채팅 연계','alternativeReviewed':'반례 검토'}[k])).join(' · ');
      const url=x.url?`<a class="case-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">원본 영상 링크 ↗</a>`:'';
      return `<article class="case-item"><div class="case-top"><span class="pill">${esc(rule.title)}</span><span class="case-status">${esc(evidenceStatus(x))}</span></div><p class="case-fact">${esc(x.fact)}</p><p class="case-notes">${esc(x.source)} · ${esc(x.time)} · ${esc(x.origin)} ${url}</p><p class="case-alt">반례: ${esc(x.alternative||'미입력')}</p><p class="case-notes">확인: ${esc(badges||'체크된 근거 없음')}</p><div class="case-actions"><button class="text-button" data-case-delete="${esc(x.id)}">기록 삭제</button></div></article>`;
    }).join('');box.querySelectorAll('[data-case-delete]').forEach(b=>b.addEventListener('click',()=>{cases=cases.filter(x=>x.id!==b.dataset.caseDelete);render();}));
    if($('reportCases'))$('reportCases').textContent=String(cases.length);
  }
  const samples=[
    {type:'QUIT',at:918,fact:'[가상] "오픈" 선언 후 2차례 주요 방어 국면에서 참여하지 않는 모습이 관찰됨',alternative:'시야 미확보 또는 합류 불가 위치였을 수 있음',checks:{video:true,repeat:true,context:false,chat:true,alternativeReviewed:false}},
    {type:'RES',at:705,fact:'[가상] 정글러가 라이너가 있는 라인에서 두 웨이브의 미니언을 연속 처치함',alternative:'웨이브를 밀어 귀환 타이밍을 만들거나 타워 방어 가능성',checks:{video:true,repeat:true,context:true,chat:false,alternativeReviewed:false}},
    {type:'OBJ',at:1460,fact:'[가상] 넥서스 타워 위기 중 아군 1명이 상단 라인으로 이동함',alternative:'순간이동·백도어·오브젝트 교환 전략일 가능성',checks:{video:true,repeat:false,context:false,chat:false,alternativeReviewed:false}},
    {type:'FEED',at:510,fact:'[가상] 전투에서 두 번 연속 사망함',alternative:'시야 부족 또는 정상적인 교전 실패',checks:{video:true,repeat:false,context:true,chat:false,alternativeReviewed:true}},
    {type:'AFK',at:824,fact:'[가상] 약 35초간 캐릭터가 움직이지 않았다가 정상 복귀함',alternative:'일시적 네트워크 오류, 장비 문제 가능성',checks:{video:true,repeat:false,context:true,chat:false,alternativeReviewed:true}},
    {type:'SAB',at:1250,fact:'[가상] 스킬을 전투 외 상황에서 여러 번 사용함',alternative:'스킬 테스트 또는 이득을 위한 사전 사용 가능성',checks:{video:true,repeat:true,context:false,chat:false,alternativeReviewed:false}},
    {type:'VERBAL',at:95,fact:'[가상] 특정 플레이어에게 반복적으로 모욕적인 채팅을 전송함',alternative:'문맥상 인용·친구 간 대화 가능성 검토 필요',checks:{video:true,repeat:true,context:true,chat:false,alternativeReviewed:false}},
    {type:'HARASS',at:1120,fact:'[가상] 특정 팀원의 동선을 반복적으로 방해하는 것으로 보이는 장면',alternative:'우발적 이동 경로 중복이나 팀 전술 가능성',checks:{video:true,repeat:true,context:false,chat:false,alternativeReviewed:false}}
  ];
  function loadDemo(){ if(cases.some(x=>x.origin==='가상 연습 자료')){error('이미 다양한 가상 사례가 입력되어 있습니다.',false);return;}samples.forEach((x,i)=>cases.push({...x,id:'SAMPLE-'+i,source:'가상 연습',url:'',time:runTime(x.at),origin:'가상 연습 자료'}));render();error('서로 다른 행동 유형의 가상 사례 8건을 불러왔습니다. 실제 영상 분석 결과가 아닙니다.',false);}
  function downloadJson(name,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function clearCases(){cases=[];render();error('사건 기록이 초기화되었습니다.',false);}
  RULES.forEach(r=>{[$('ruleSelect'),$('caseType')].forEach(sel=>{const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.title;sel.appendChild(opt);});});
  $('ruleSelect').addEventListener('change',showRule);$('caseType').addEventListener('change',()=>{$('ruleSelect').value=$('caseType').value;showRule();});
  $('addCase').addEventListener('click',validateAndAdd);
  $('loadCaseSamples').addEventListener('click',loadDemo);
  $('clearCases').addEventListener('click',clearCases);
  $('exportRules').addEventListener('click',()=>downloadJson('brb_common_review_standard_v2.json',{version:'2.0',kind:'research review framework, not official Riot disciplinary criteria',sharedReviewSteps:['관찰 사실','발생 시간과 반복성','게임 목표와 당시 맥락','정상 플레이 반례','다각도 근거와 판단 보류'],rules:RULES}));
  showRule();render();
  window.EvidenceCommon={count:()=>cases.length,snapshot:()=>cases.map(x=>({...x,reviewState:evidenceStatus(x),ruleTitle:getRule(x.type).title})),loadDemo};
})();
