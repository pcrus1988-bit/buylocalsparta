#!/usr/bin/env python3
"""Create Android Companion launcher icons from the existing official website logo.
No alternative logo artwork, generated text, or remote image assets.
"""
from __future__ import annotations
import base64
import io
import pathlib
import re
import xml.etree.ElementTree as ET
from PIL import Image

ROOT=pathlib.Path(__file__).resolve().parents[2]
LOGO=ROOT/"apps/web/public/brand/kontamou-logo.svg"
ASSETS=ROOT/"mobile/assets"
ASSETS.mkdir(parents=True,exist_ok=True)

svg=LOGO.read_text(encoding="utf-8")
root=ET.fromstring(svg)
viewbox=[float(x) for x in root.attrib["viewBox"].split()]
match=re.search(r'data:image/webp;base64,([A-Za-z0-9+/=]+)',svg)
if not match: raise SystemExit("Expected the official embedded WebP website logo")
image=Image.open(io.BytesIO(base64.b64decode(match.group(1)))).convert("RGB")
w,h=image.size
x0,y0,vw,vh=viewbox
coords=(
 round(x0*w/480),round(y0*h/320),
 round((x0+vw)*w/480),round((y0+vh)*h/320)
)
logo=image.crop(coords)
# Consistent wordmark on a square icon; no redrawn letters or altered colors.
for name,width in [("icon.png",760),("adaptive-icon.png",650)]:
 size=1024
 height=round(width*logo.height/logo.width)
 resized=logo.resize((width,height),Image.Resampling.LANCZOS)
 canvas=Image.new("RGB",(size,size),(254,254,254))
 canvas.paste(resized,((size-width)//2,(size-height)//2))
 out=ASSETS/name
 canvas.save(out,format="PNG",optimize=True)
 print(f"Official-brand Android icon: {out.relative_to(ROOT)} {out.stat().st_size} bytes")
