(()=>{'use strict';
const $=id=>document.getElementById(id);
if($('peer-test'))return;
const section=document.createElement('section');section.id='peer-test';section.className='peer-test';
section.innerHTML=[
'<div class="peer-head"><div><span class="kicker">BR-B · 동료 사용성 테스트</span><h2>동료의 한 줄 평</h2><p>처음 보는 동료가 설명 없이 직접 써보는 테스트입니다. 이름과 닉네임은 적지 마세요.</p></div><span class="peer-badge">실제 사용 의견만 기록</span></div>',
'<div class="peer-cols"><div class="peer-steps"><h3>1분 테스트</h3><ol>',
'<li><b>예시로 테스트 시작</b>을 눌러 장면 목록이 표시되는지 확인하세요.</li>',
'<li><b>이 장면 자세히 확인</b>을 눌러 시각과 내용이 나타나는지 확인하세요.</li>',
'<li><b>결과 다운로드</b> 탭에서 기록 저장을 시험하세요.</li>',
'</ol><button type="button" class="button primary" id="peerTryDemo">예시로 테스트 시작 →</button><p class="micro-caption">실제 게임 영상 없이 가상 경기 기록으로 체험할 수 있습니다.</p>',
'<div class="peer-note">한 줄 평은 이 브라우저에만 보관됩니다. <strong>평가 복사 또는 파일 저장으로 개발자에게 직접 보내주세요.</strong> 자동 전송되지 않습니다.</div></div>',
'<form id="peerForm" class="peer-form">',
'<label class="peer-field">테스트 결과<select id="peerOutcome" required><option value="">선택해 주세요</option><option value="완료">세 단계 모두 완료</option><option value="부분 완료">일부만 완료</option><option value="진행 불가">진행 불가</option></select></label>',
'<fieldset class="peer-check"><legend>직접 성공한 항목만 체크</legend><label><input type="checkbox" name="peerTask" value="예시 실행"/> 예시 실행</label><label><input type="checkbox" name="peerTask" value="장면 확인"/> 장면 확인</label><label><input type="checkbox" name="peerTask" value="결과 다운로드"/> 결과 다운로드</label></fieldset>',
'<label class="peer-field">동료의 한 줄 감상 (필수)<textarea id="peerOneLine" rows="2" maxlength="180" required placeholder="실제로 사용해 본 느낌을 한 문장으로 적어 주세요."></textarea></label>',
'<label class="peer-field">불편했던 점 (선택)<textarea id="peerProblem" rows="2" maxlength="500" placeholder="어느 기능에서 막혔나요?"></textarea></label>',
'<div class="peer-actions"><button type="submit" class="button primary">평가 기록</button><button type="button" class="button outline" id="peerCopy">평가 복사</button><button type="button" class="button outline" id="peerDownload">파일 저장 ↓</button></div>',
'<p id="peerStatus" class="peer-status" aria-live="polite" role="status">아직 실제 동료 평가가 없습니다.</p>',
'<div id="peerSaved" hidden class="peer-saved"><small>이 기기에 저장된 한 줄 감상</small><p id="peerSavedText"></p></div>',
'<textarea id="peerFallback" hidden readonly rows="5" aria-label="평가 복사용 텍스트"></textarea>',
'</form></div>'
].join('');
(document.getElementById('research')||document.querySelector('footer')).before(section);
const style=document.createElement('style');
style.textContent=[
'.peer-test{margin:45px 0;padding:30px;border:1px solid #3d6553;border-radius:16px;background:linear-gradient(120deg,#112923,#101920);scroll-margin-top:24px}',
'.peer-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:24px}',
'.peer-head h2{font-size:29px;margin:7px 0}.peer-head p{font-size:13px;color:var(--muted);margin:0}',
'.peer-badge{font-size:11px;color:var(--accent);border:1px solid #456a56;padding:8px;border-radius:6px;white-space:nowrap}',
'.peer-cols{display:grid;grid-template-columns:1fr 1.1fr;gap:20px}',
'.peer-steps,.peer-form{background:var(--surface);padding:23px;border:1px solid var(--border);border-radius:12px;min-width:0}',
'.peer-steps h3{margin:0 0 15px;font-size:16px}.peer-steps ol{padding-left:22px;margin:0 0 20px}',
'.peer-steps li{font-size:13px;color:#bfd0c9;margin-bottom:11px;line-height:1.8}.peer-steps li b{color:var(--text)}',
'.peer-note{font-size:12px;line-height:1.8;border-radius:8px;border:1px solid #3d6553;color:#b8d9c8;background:#152921;padding:14px;margin:24px 0 0}',
'.peer-form{display:flex;flex-direction:column;gap:14px}.peer-field{display:flex;flex-direction:column;gap:7px;color:#bed2cb;font-size:12px;font-weight:bold}',
'.peer-field select,.peer-field textarea,#peerFallback{background:#0b171c;border:1px solid #39504c;color:var(--text);border-radius:7px;padding:11px;width:100%;font-size:13px;font-weight:normal}',
'.peer-check{border:1px solid #39504c;border-radius:8px;padding:12px;display:flex;gap:8px 18px;flex-wrap:wrap}',
'.peer-check legend{font-size:12px;color:var(--muted)}.peer-check label{font-size:12px;display:flex;gap:6px;align-items:center}',
'.peer-check input{accent-color:#adf1ca}.peer-actions{display:flex;flex-wrap:wrap;gap:8px}.peer-actions button{font-size:12px}',
'.peer-status{font-size:12px;color:#abdfc6;margin:0}.peer-saved{border:1px solid #40634f;background:#15291f;border-radius:8px;padding:12px;overflow-wrap:anywhere}',
'.peer-saved small{color:#a2c9b5;font-size:11px}.peer-saved p{margin:4px 0 0}',
'.peer-nav{color:var(--accent);border:1px solid #3b5f4d;border-radius:7px;font-size:12px;letter-spacing:0;text-decoration:none;padding:6px 9px}',
'.hero-peer{color:var(--accent);font-size:13px;margin:12px 0 0}.hero-peer a{color:var(--accent)}',
'@media(max-width:850px){.peer-cols{grid-template-columns:1fr}.peer-head{flex-direction:column}}',
'@media(max-width:600px){.peer-test{padding:15px;margin:25px 0}.peer-steps,.peer-form{padding:15px}.peer-head h2{font-size:23px}.peer-badge{white-space:normal}.peer-actions button{flex:1 1 auto}.peer-nav{font-size:11px}}'
].join('\n');document.head.appendChild(style);
const key='lol_brb_peer_review_v1';
function show(d){$('peerSavedText').textContent=d.oneLine;$('peerSaved').hidden=false;}
function message(t){$('peerStatus').textContent=t;}
function collect(){if(!$('peerForm').reportValidity())return null;
const d={date:new Date().toLocaleString('ko-KR'),outcome:$('peerOutcome').value,checked:Array.from(document.querySelectorAll('input[name="peerTask"]:checked'),n=>n.value),oneLine:$('peerOneLine').value.trim(),problem:$('peerProblem').value.trim()};
if(!d.oneLine){$('peerOneLine').focus();return null;}return d;}
function text(d){return ['[BR-B 익명 동료 1분 테스트]','일시: '+d.date,'테스트 결과: '+d.outcome,'확인한 항목: '+(d.checked.join(', ')||'없음'),'동료 한 줄 감상: '+d.oneLine,'불편했던 점: '+(d.problem||'없음')].join('\n');}
function save(){const d=collect();if(!d)return null;try{localStorage.setItem(key,JSON.stringify(d));}catch{}
show(d);message('이 기기에 평가가 기록됐습니다. 복사하거나 파일로 저장해 개발자에게 전달해 주세요.');return d;}
$('peerTryDemo').addEventListener('click',()=>{$('startDemo')?.click();});
$('peerForm').addEventListener('submit',e=>{e.preventDefault();save();});
$('peerCopy').addEventListener('click',async()=>{const d=save();if(!d)return;const value=text(d);try{if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');await navigator.clipboard.writeText(value);message('평가가 복사됐습니다. 개발자에게 보내주세요.');}catch{$('peerFallback').hidden=false;$('peerFallback').value=value;$('peerFallback').focus();$('peerFallback').select();message('아래 텍스트를 직접 복사해 보내주세요.');}});
$('peerDownload').addEventListener('click',()=>{const d=save();if(!d)return;const u=URL.createObjectURL(new Blob(['\uFEFF'+text(d)],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='BRB_동료_익명_한줄평.txt';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);message('평가 파일을 저장했습니다. 개발자에게 보내주세요.');});
try{const d=JSON.parse(localStorage.getItem(key)||'null');if(d&&d.oneLine){$('peerOutcome').value=d.outcome;$('peerOneLine').value=d.oneLine;$('peerProblem').value=d.problem||'';const set=new Set(d.checked||[]);document.querySelectorAll('input[name="peerTask"]').forEach(x=>{x.checked=set.has(x.value)});show(d);message('이 브라우저에 저장된 평가가 있습니다.');}}catch{}
})();