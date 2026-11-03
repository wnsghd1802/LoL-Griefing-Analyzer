#!/usr/bin/env python3
"""Optional large-video local OCR sampler for PlayCheck v4.

External executables required: ffmpeg, ffprobe, tesseract with kor/eng language data.
Never uploads video data or calls a network API. Emits candidates, not judgments.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

OPEN_RE = re.compile(r"오픈\s*(?:함|해|한다|할게|하자|할거|하겠)|(?:겜|게임)\s*(?:안\s*해|포기|안\s*함)|던진다|던짐|고의로\s*(?:죽|던)|나\s*안\s*함|open\s*(?:mid|top|bot)|\bafk\b", re.I)
ABUSE_RE = re.compile(r"시발|씨발|ㅅㅂ|병신|ㅂㅅ|개새끼|닥쳐|꺼져|\b(?:idiot|stupid|trash|moron|retard|fuck|useless|loser)\b", re.I)

def process(cmd, *, data=None, timeout=90):
    return subprocess.run(cmd, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)

def probe(video):
    c = process(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',str(video)])
    if c.returncode:
        raise RuntimeError('ffprobe가 영상을 읽지 못했습니다: '+c.stderr.decode('utf-8','replace')[-250:])
    info=json.loads(c.stdout)
    duration=float(info['format']['duration'])
    if duration<=0:raise ValueError('영상 길이가 올바르지 않습니다')
    if not any(s.get('codec_type')=='video' for s in info.get('streams',[])):
        raise ValueError('비디오 스트림이 없습니다')
    return duration

def ocr_frame(video,at,lang,crop):
    vf='crop=iw*0.44:ih*0.4:0:ih*0.58,scale=1100:-1' if crop=='chat' else 'scale=1400:-1'
    f=process(['ffmpeg','-hide_banner','-loglevel','error','-ss',f'{at:.3f}','-i',str(video),'-vf',vf,'-frames:v','1','-f','image2pipe','-vcodec','png','-'],timeout=120)
    if f.returncode or not f.stdout:
        return ''
    r=process(['tesseract','stdin','stdout','-l',lang,'--psm','6'],data=f.stdout,timeout=120)
    if r.returncode:
        raise RuntimeError('Tesseract 언어 데이터 또는 실행 환경을 확인하세요: '+r.stderr.decode('utf-8','replace')[-300:])
    return ' '.join(r.stdout.decode('utf-8','replace').split())[:500]

def classify(s):
    labels=[]
    if OPEN_RE.search(s):labels.append('게임 포기·방해 선언 후보')
    if ABUSE_RE.search(s):labels.append('공격적 표현 후보')
    return labels

def run(args):
    for cmd in ['ffmpeg','ffprobe','tesseract']:
        if not shutil.which(cmd):raise RuntimeError(f'{cmd} 실행 파일이 PATH에 없습니다. README를 확인하세요.')
    video=Path(args.video).expanduser().resolve()
    if not video.is_file():raise FileNotFoundError(f'파일을 찾을 수 없습니다: {video}')
    duration=probe(video)
    start=float(args.start)
    end=float(args.end) if args.end is not None else duration
    step=float(args.step)
    if start<0 or end<=start or end>duration+0.5 or step<1:raise ValueError('시작·종료·간격을 확인하세요')
    n=int((end-start+step-0.000001)//step)
    if n<=0:raise ValueError('읽을 프레임이 없습니다')
    if n>args.max_frames:raise ValueError(f'최대 {args.max_frames}프레임을 초과했습니다. --step을 늘리거나 --start/--end로 나눠 주세요.')
    findings=[];seen={};read_frames=0
    for i in range(n):
        at=min(end-0.05,start+i*step)
        if at>=duration:break
        s=ocr_frame(video,at,args.lang,args.crop)
        labels=classify(s)
        read_frames+=1
        if labels:
            sig=re.sub(r'[^\w가-힣]','',s.lower())[:120]
            if len(sig)>2 and (sig not in seen or at-seen[sig]>=60):
                seen[sig]=at
                findings.append({'source':'오프라인 영상 OCR','at':round(at,2),'category':' / '.join(labels),
                                 'title':labels[0],'rule':'OCR 문구','fact':f'화면에서 읽힌 글자: “{s}”',
                                 'alternative':'OCR 오인식·인용·농담·대화 맥락·실제 행동 여부를 영상과 함께 확인해야 합니다.',
                                 'detail':f'{read_frames}번째 프레임 · 오프라인 로컬 분석','status':'검토 필요'})
        if i==0 or (i+1)%10==0 or i==n-1:
            print(f'진행: {i+1}/{n}프레임, 검토 후보 {len(findings)}건',flush=True)
    out=Path(args.out).expanduser().resolve()
    out.parent.mkdir(parents=True,exist_ok=True)
    payload={'format':'playcheck-findings','version':1,'application':'PlayCheck v4',
            'type':'video-ocr','metadata':{'video':video.name,'durationSec':duration,'startSec':start,'endSec':end,
                                         'frameStepSec':step,'framesExamined':read_frames,
                                         'note':'신호 탐색 결과. 실제 고의성·제재 여부를 판정하지 않음',
                                         'generatedAt':datetime.now(timezone.utc).isoformat()},'items':findings}
    out.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'완료: {out} · {read_frames}프레임 · 후보 {len(findings)}건')

def main():
    ap=argparse.ArgumentParser(description='대용량 게임 영상의 로컬 OCR 채팅 신호 탐색 · 자동 제재 판정 아님')
    ap.add_argument('video',help='영상 파일 경로 (공백 허용, 따옴표로 감싸기)')
    ap.add_argument('--out',default='playcheck_offline_results.json',help='내보낼 JSON 파일 이름')
    ap.add_argument('--step',type=float,default=8,help='샘플링 간격(초), 기본 8')
    ap.add_argument('--start',type=float,default=0,help='시작 시각(초)')
    ap.add_argument('--end',type=float,default=None,help='종료 시각(초), 생략하면 영상 끝까지')
    ap.add_argument('--lang',default='kor+eng',help='Tesseract 언어, 기본 kor+eng')
    ap.add_argument('--crop',choices=['chat','full'],default='chat',help='채팅 영역 또는 전체 화면')
    ap.add_argument('--max-frames',type=int,default=2000,help='한 번에 처리할 최대 프레임 수')
    args=ap.parse_args()
    try:run(args)
    except (OSError,ValueError,RuntimeError,KeyError,json.JSONDecodeError,subprocess.TimeoutExpired) as e:
        print('오류:',e,file=sys.stderr);sys.exit(1)
if __name__=='__main__':main()
