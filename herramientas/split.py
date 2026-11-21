# Uso: python build.py <carpeta-con-las-fotos-de-whatsapp>
# Requiere: pip install "rembg[cpu]" "opencv-contrib-python-headless<4.13" pillow
# y el modelo FSRCNN_x2.pb en herramientas/modelos/ (github.com/Saafke/FSRCNN_Tensorflow).
import os, sys
AQUI=os.path.dirname(os.path.abspath(__file__))
import glob, json, numpy as np
from PIL import Image, ImageDraw
fs=sorted(glob.glob(os.path.join(sys.argv[1],'*.jpeg')))
B=json.load(open(os.path.join(AQUI,'datos','boxes.json')))
PHOTO=[10,11,13,14,15,17,20,21,22,25,27,29,30,35,36,38,39,40]
def split(a,box,depth=0):
    x,y,w,h=box; r=a[y:y+h,x:x+w]
    white=(r.min(2)>238)
    for axis in (1,0):  # columnas, luego filas
        full=white.all(0) if axis==1 else white.all(1)
        L=len(full); i=int(L*0.08)
        while i<int(L*0.92):
            if full[i]:
                j=i
                while j<L and full[j]: j+=1
                if j-i>=3:
                    if axis==1: return split(a,(x,y,i,h),depth+1)+split(a,(x+j,y,w-j,h),depth+1)
                    else: return split(a,(x,y,w,i),depth+1)+split(a,(x,y+j,w,h-j),depth+1)
                i=j
            i+=1
    # recorta bordes blancos
    ys,xs=np.where(~white)
    if len(xs)==0: return []
    return [(x+int(xs.min()),y+int(ys.min()),int(xs.max()-xs.min()+1),int(ys.max()-ys.min()+1))]
res={}
for n in PHOTO:
    im=Image.open(fs[n-1]).convert('RGB'); a=np.asarray(im).astype(int); H,W=a.shape[:2]
    out=[]
    for b in B[str(n)]:
        out+=split(a,tuple(b))
    out=[b for b in out if b[2]*b[3]>W*H*0.02]
    out.sort(key=lambda b:(b[0]//(W//4),b[1]))
    res[n]=out
    d=im.copy(); dr=ImageDraw.Draw(d)
    for i,(x,y,w,h) in enumerate(out):
        dr.rectangle((x,y,x+w,y+h),outline='magenta',width=6); dr.text((x+12,y+12),str(i),fill='magenta',font_size=70)
    d.thumbnail((330,460)); d.save(os.path.join(AQUI,'datos',f's{n:02d}.jpg'))
json.dump(res,open(os.path.join(AQUI,'datos','photo_boxes.json'),'w'))
fl=sorted(glob.glob(os.path.join(AQUI,'datos','s*.jpg'))); s=Image.new('RGB',(6*330,3*480),'white')
for i,f in enumerate(fl):
    im=Image.open(f); x,y=(i%6)*330,(i//6)*480; s.paste(im,(x,y+20)); ImageDraw.Draw(s).text((x+4,y+2),f[-7:],fill='red',font_size=16)
s.save(os.path.join(AQUI,'datos','revision.jpg'),quality=80)
