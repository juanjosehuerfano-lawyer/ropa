# Uso: python build.py <carpeta-con-las-fotos-de-whatsapp>
# Requiere: pip install "rembg[cpu]" "opencv-contrib-python-headless<4.13" pillow
# y el modelo FSRCNN_x2.pb en herramientas/modelos/ (github.com/Saafke/FSRCNN_Tensorflow).
import os, sys
AQUI=os.path.dirname(os.path.abspath(__file__))
import glob, json, re, unicodedata, numpy as np, cv2
from PIL import Image, ImageFilter
from rembg import remove, new_session
from spec import P, HEX
SITE=os.path.dirname(AQUI)
fs=sorted(glob.glob(os.path.join(sys.argv[1],'*.jpeg')))
DB=json.load(open(os.path.join(AQUI,'datos','boxes.json'))); PB=json.load(open(os.path.join(AQUI,'datos','photo_boxes.json')))
gen=new_session('birefnet-general-lite')
sr=cv2.dnn_superres.DnnSuperResImpl_create(); sr.readModel(os.path.join(AQUI,'modelos','FSRCNN_x2.pb')); sr.setModel('fsrcnn',2)
slug=lambda s:re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip('-')
def mejorar(im,maxlado):
    # Solo nitidez y resolución: no cambia color, forma ni detalles de la prenda.
    if max(im.size)<maxlado*0.8:
        im=Image.fromarray(cv2.cvtColor(sr.upsample(cv2.cvtColor(np.asarray(im),cv2.COLOR_RGB2BGR)),cv2.COLOR_BGR2RGB))
    if max(im.size)>maxlado: im.thumbnail((maxlado,maxlado),Image.LANCZOS)
    return im.filter(ImageFilter.UnsharpMask(radius=1.2,percent=45,threshold=3))
def recorte(im):
    im=mejorar(im,1000); o=remove(im,session=gen); a=np.asarray(o)[:,:,3]
    # quita restos pequeños (etiquetas) conservando la prenda: componente más grande
    n,lab,st,_=cv2.connectedComponentsWithStats((a>40).astype(np.uint8),8)
    if n>1:
        k=1+int(np.argmax(st[1:,4])); keep=np.isin(lab,[i for i in range(1,n) if st[i,4]>st[k,4]*0.15])
        o=np.asarray(o).copy(); o[~keep,3]=0; o=Image.fromarray(o)
    # rellena huecos encerrados dentro de la prenda (fallos del segmentador en zonas blancas)
    o=np.asarray(o).copy(); m=(o[:,:,3]>128).astype(np.uint8)
    ff=np.pad(1-m,1,constant_values=1).copy(); mask=np.zeros((ff.shape[0]+2,ff.shape[1]+2),np.uint8)
    cv2.floodFill(ff,mask,(0,0),2); huecos=(ff[1:-1,1:-1]==1)
    o[huecos,3]=255; o=Image.fromarray(o)
    return o.crop(o.getbbox())
def guardar(im,nombre,alpha=False):
    p=f'img/prendas/{nombre}.webp'; im.save(f'{SITE}/{p}',quality=86 if alpha else 82,method=6); return p
cat=[]
for p in P:
    prod=dict(ref=p['ref'],nombre=p['nombre'],marca=p['marca'],tipo=p['tipo'],publico=p['publico'],descripcion=p['desc'],colores=[])
    if 'ficha' in p:
        n,principal,orden=p['ficha']; im=Image.open(fs[n-1]).convert('RGB'); W,H=im.size; bx=DB[str(n)]
        x,y,w,h=bx[0]; pad=int(0.02*W)
        main=recorte(im.crop((max(0,x-pad),max(0,y-pad),min(W,x+w+pad),min(H,y+h+pad))))
        vs=bx[1:]; y0=min(b[1] for b in vs)-int(.01*H); y1=max(b[1]+b[3] for b in vs)+int(.01*H)
        N=len(orden); x0,x1=int(.01*W),int(.99*W); cw=(x1-x0)/N
        prod['recorte']=True
        for i,c in enumerate(orden):
            img=main if c==principal else recorte(im.crop((int(x0+i*cw),y0,int(x0+(i+1)*cw),y1)))
            ruta=guardar(img,f"{slug(p['ref'])}-{slug(c)}",True)
            prod['colores'].append(dict(nombre=c,hex=HEX[c],tallas=p['tallas'],fotos=[ruta]))
    else:
        prod['recorte']=False
        fotos={}
        for k,(n,i,c) in enumerate(p['fotos']):
            im=Image.open(fs[n-1]).convert('RGB')
            if i!='full':
                if isinstance(i,tuple) or isinstance(i,list):
                    bi,part=i; x,y,w,h=PB[str(n)][bi]; t=w/3; im=im.crop((int(x+part*t),y,int(x+(part+1)*t),y+h))
                    a=np.asarray(im); nz=np.where(a.min(2)<238); im=im.crop((nz[1].min(),nz[0].min(),nz[1].max()+1,nz[0].max()+1))
                else:
                    x,y,w,h=PB[str(n)][i]; im=im.crop((x,y,x+w,y+h))
            ruta=guardar(mejorar(im,1200),f"{slug(p['ref'])}-{slug(c)}-{k+1}")
            fotos.setdefault(c,[]).append(ruta)
        for c,t in p['colores']:
            prod['colores'].append(dict(nombre=c,hex=HEX[c],tallas=t or 'Consultar',fotos=fotos.get(c,[])))
    cat.append(prod); print(p['ref'],len(prod['colores']),flush=True)
open(f'{SITE}/data/catalogo.js','w').write('/* Catálogo Vorágine Ropa: '+str(len(cat))+' prendas. Sin precios: todo se cotiza por WhatsApp. */\nwindow.CATALOGO = '+json.dumps(cat,ensure_ascii=False,indent=1)+';\n')
