/* Anonymous usability feedback: on-device storage only. No network or analytics. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY = 'lol_griefing_analyzer_peer_feedback_v1';
  let latest = null;
  const status = (message, isError = false) => {
    const el = $('peerStatus');
    el.textContent = message;
    el.classList.toggle('error', isError);
  };
  const buildText = data => [
    '[BR-B 동료 1분 테스트 · 익명 평가]',
    '테스트 일시: ' + data.date,
    '테스트 결과: ' + data.outcome,
    '직접 확인한 기능: ' + (data.checked.length ? data.checked.join(', ') : '표시 없음'),
    '동료 한 줄 감상: ' + data.oneLine,
    '불편했던 점: ' + (data.problem || '별도 기록 없음'),
    '※ 동료 본인이 작성한 테스트 의견이며 자동 판정·조사 결과가 아닙니다.'
  ].join('\n');
  function render(data) {
    $('peerSavedQuote').textContent = data.oneLine;
    $('peerReceipt').hidden = false;
    status('평가를 이 기기에 기록했습니다. 복사하거나 파일로 저장한 뒤 개발자에게 직접 전달해 주세요.');
  }
  function getData() {
    if (!$('peerForm').reportValidity()) return null;
    return {
      version: 'v5.1',
      date: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
      outcome: $('peerOutcome').value,
      checked: Array.from(document.querySelectorAll('input[name="peerTask"]:checked'), x => x.value),
      oneLine: $('peerOneLine').value.trim(),
      problem: $('peerProblem').value.trim()
    };
  }
  function store(data) {
    latest = data;
    try {localStorage.setItem(KEY, JSON.stringify(data));}
    catch {status('브라우저 저장이 막혀 있습니다. 평가 복사 또는 파일 저장으로 전달해 주세요.');}
    render(data);
  }
  function ensureData() {
    // Always use current form values, so users can correct a typo before sharing.
    const data = getData();
    if (!data) return null;
    store(data);
    return data;
  }
  function init() {
    if(location.hash === '#peer-test') $('peer-test').open = true;
    $('peerTryDemo')?.addEventListener('click', () => {
      $('startDemo')?.click();
      // The app's existing demo handler is responsible for showing the results.
    });
    $('peerForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const data = getData();
      if (data) store(data);
    });
    $('peerCopy')?.addEventListener('click', async () => {
      const data = ensureData();
      if (!data) return;
      const share = buildText(data);
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(share);
        status('평가 내용이 복사됐습니다. 메신저 등으로 개발자에게 보내주세요.');
      } catch {
        const fallback = $('peerCopyFallback');
        fallback.value = share;
        fallback.hidden = false;
        fallback.focus();
        fallback.select();
        status('자동 복사를 사용할 수 없습니다. 아래 텍스트를 직접 복사해 전달해 주세요.');
      }
    });
    $('peerDownload')?.addEventListener('click', () => {
      const data = ensureData();
      if (!data) return;
      const blob = new Blob(['\ufeff' + buildText(data)], {type: 'text/plain;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'BRB_익명_동료_한줄평.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status('평가 파일을 저장했습니다. 파일을 개발자에게 전달해 주세요.');
    });
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw && JSON.parse(raw);
      if (data && typeof data.oneLine === 'string' && typeof data.outcome === 'string') {
        latest = data;
        $('peerOutcome').value = data.outcome;
        $('peerOneLine').value = data.oneLine;
        $('peerProblem').value = data.problem || '';
        const checked = new Set(Array.isArray(data.checked) ? data.checked : []);
        document.querySelectorAll('input[name="peerTask"]').forEach(input => {input.checked = checked.has(input.value);});
        render(data);
      }
    } catch { /* Storage can be unavailable in a privacy-focused browser. */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
