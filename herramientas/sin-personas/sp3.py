import os, numpy as np, cv2
from PIL import Image, ImageDraw
SRC='/home/user/ropa/img/prendas'
dudosas='boss-class-negro-1 ck-chq-negro-2 ck-chq-rojo-3 tommy-flag-azul-2 tommy-flag-blanco-4 tommy-flag-rojo-3 tommy-flag-negro-1 prada-luxe-blanco-2 polo-core-gris-1 lacoste-smart-blanco-1 vr-02-azul-noche-3 vr-02-azul-noche-4 vr-02-rojo-1 vr-02-rojo-2 polo-core-azul-3 tommy-hilo-rojo-1'.split()
def guardar(b,alfa,suf):
    im=Image.open(f'{SRC}/{b}.webp').convert('RGB')
    n,lab,st,_=cv2.connectedComponentsWithStats((alfa>.5).astype(np.uint8),8)
    if n>1:
        mx=st[1:,4].max(); keep=np.isin(lab,[i for i in range(1,n) if st[i,4]>=mx*0.25]); alfa=alfa*keep
    # rellena huecos encerrados
    m=(alfa>.5).astype(np.uint8); ff=np.pad(1-m,1,constant_values=1).copy(); mk=np.zeros((ff.shape[0]+2,ff.shape[1]+2),np.uint8)
    cv2.floodFill(ff,mk,(0,0),2); alfa=np.where(ff[1:-1,1:-1]==1,1,alfa)
    o=Image.fromarray(np.dstack([np.asarray(im),(alfa*255).astype(np.uint8)]))
    if o.getbbox(): o=o.crop(o.getbbox())
    o.save(f'variantes/{b}__{suf}.png'); return o
os.makedirs('variantes',exist_ok=True); filas=[]
for b in dudosas:
    im=Image.open(f'{SRC}/{b}.webp'); W,H=im.size
    a=np.asarray(Image.open(f'masc_fino/{b}.png')).astype(np.float32)/255
    m=np.asarray(Image.open(f'masc_ropa/{b}.png')); sup=m[:m.shape[0]//3] if m.shape[0]>=H*2 else m
    sup=cv2.resize(sup,(W,H)).astype(np.float32)/255
    fila=[im.convert('RGBA'), guardar(b,np.clip(a*1.3,0,1),'fino'), guardar(b,np.clip(sup*1.2,0,1)*(a>.3),'estricto')]
    filas.append((b,fila))
T=170; s=Image.new('RGB',(3*T+200,len(filas)*(T+6)),(30,26,32))
for r,(b,fila) in enumerate(filas):
    ImageDraw.Draw(s).text((3*T+8,r*(T+6)+70),b,fill='white',font_size=12)
    for k,im in enumerate(fila):
        t=im.copy(); t.thumbnail((T-6,T-6)); s.paste(t,(k*T+3,r*(T+6)+3),t)
s.save('variantes_hoja.jpg',quality=80)
