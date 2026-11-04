#!/usr/bin/env python3
"""Tesseract CLI parity check for bundled synthetic Korean chat footage.
This validates crop + page segmentation independently, NOT browser TesseractJS performance.
"""
import subprocess, tempfile
from pathlib import Path
try:
 from PIL import Image
except Exception as e: raise SystemExit(f'PIL required: {e}')
base=Path(__file__).resolve().parents[1]
video=base/'sample_data/ocr_synthetic_open.mp4'
with tempfile.TemporaryDirectory() as t:
 frame=Path(t)/'frame.png'
 crop=Path(t)/'crop.png'
 subprocess.run(['ffmpeg','-y','-loglevel','error','-ss','1','-i',str(video),'-frames:v','1',str(frame)],check=True)
 im=Image.open(frame)
 w,h=im.size
 im=im.crop((0,int(h*.55),int(w*.60),int(h*.99)))
 scale=min(2,1920/im.width)
 im=im.resize((round(im.width*scale),round(im.height*scale)))
 im.save(crop)
 r=subprocess.run(['tesseract',str(crop),'stdout','-l','kor+eng','--psm','6'],text=True,capture_output=True,check=True)
 assert '오픈함' in r.stdout,f'Expected phrase missing: {r.stdout!r}'
 print('PASS: synthetic video Korean chat extracted by native Tesseract PSM6:',r.stdout.strip())
