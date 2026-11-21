# Uso: python build.py <carpeta-con-las-fotos-de-whatsapp>
# Requiere: pip install "rembg[cpu]" "opencv-contrib-python-headless<4.13" pillow
# y el modelo FSRCNN_x2.pb en herramientas/modelos/ (github.com/Saafke/FSRCNN_Tensorflow).
import os, sys
AQUI=os.path.dirname(os.path.abspath(__file__))
import glob, json, numpy as np, cv2
from PIL import Image, ImageDraw
from rembg import remove, new_session
fs=sorted(glob.glob(os.path.join(sys.argv[1],'*.jpeg')))
FLAT=[12,16,18,19,23,24,26,28,31,32,33,34,37,41,42]
PHOTO=[10,11,13,14,15,17,20,21,22,25,27,29,30,35,36,38,39,40]
gen=new_session('isnet-general-use')
out={}
def boxes_from_mask(m,minarea):
    n,lab,st,_=cv2.connectedComponentsWithStats(m.astype(np.uint8),8)
    return [tuple(map(int,st[i][:4])) for i in range(1,n) if st[i][4]>=minarea]
for n in PHOTO+FLAT:
    im=Image.open(fs[n-1]).convert('RGB'); a=np.asarray(im).astype(int); H,W=a.shape[:2]
    if n in PHOTO:
        # fotos: zonas no blancas y con textura (excluye barras grises de precio y texto)
        nonwhite=(a.sum(2)<720)
        g=cv2.cvtColor(np.asarray(im),cv2.COLOR_RGB2GRAY)
        tex=cv2.blur((np.abs(cv2.Laplacian(g,cv2.CV_32F))>4).astype(np.float32),(25,25))>0.08
        m=(nonwhite & tex).astype(np.uint8)
        m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((15,15),np.uint8))
        bs=[b for b in boxes_from_mask(m,W*H*0.02) if b[3]>H*0.12]
    else:
        mk=np.asarray(remove(im,session=gen,only_mask=True))>128
        mk=cv2.morphologyEx(mk.astype(np.uint8),cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
        bs=[b for b in boxes_from_mask(mk,W*H*0.012) if b[3]>H*0.1]
    bs.sort(key=lambda b:(round(b[1]/(H*0.2)),b[0]))
    out[n]=bs
    d=im.copy(); dr=ImageDraw.Draw(d)
    for i,(x,y,w,h) in enumerate(bs):
        dr.rectangle((x,y,x+w,y+h),outline='magenta',width=6); dr.text((x+10,y+10),str(i),fill='magenta',font_size=60)
    d.thumbnail((500,700)); d.save(os.path.join(AQUI,'datos',f'{n:02d}.jpg'))
json.dump(out,open(os.path.join(AQUI,'datos','boxes.json'),'w'))
print({k:len(v) for k,v in out.items()})
