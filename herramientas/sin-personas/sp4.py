import os, glob, json, re, numpy as np, cv2
from PIL import Image
R='/home/user/ropa'; SRC=R+'/img/prendas'
FINO='ck-chq-negro-2 ck-chq-rojo-3 tommy-flag-azul-2 tommy-flag-blanco-4 tommy-flag-rojo-3 prada-luxe-blanco-2 prada-luxe-cafe-5 prada-luxe-morado-3 prada-luxe-negro-6 prada-luxe-verde-4 prada-luxe-verde-oscuro-7'.split()
ESTRICTO='boss-class-negro-1 tommy-flag-negro-1 vr-02-azul-noche-3 vr-02-azul-noche-4 vr-02-rojo-1 vr-02-rojo-2 polo-core-azul-3 tommy-hilo-rojo-1 lacoste-smart-blanco-1'.split()
FOTO='polo-trenzado-gris-1 polo-trenzado-negro-2 vr-03-blanco-1 vr-03-negro-2 lacoste-mc-blanco-3 tommy-hoodie-blanco-1 polo-teddy-gris-1 polo-core-gris-1'.split()
hechos={}
for f in sorted(glob.glob('masc_ropa/*.png')):
    b=os.path.basename(f)[:-4]
    if b in FOTO: continue
    if b in FINO: o=Image.open(f'variantes/{b}__fino.png') if os.path.exists(f'variantes/{b}__fino.png') else None
    elif b in ESTRICTO: o=Image.open(f'variantes/{b}__estricto.png')
    else: o=Image.open(f'sinpersona/{b}.png')
    if o is None:  # fino aún no calculado para este
        im=Image.open(f'{SRC}/{b}.webp').convert('RGB'); a=np.asarray(Image.open(f'masc_fino/{b}.png')).astype(np.float32)/255
        al=np.clip(a*1.3,0,1); m=(al>.5).astype(np.uint8); ff=np.pad(1-m,1,constant_values=1).copy(); mk=np.zeros((ff.shape[0]+2,ff.shape[1]+2),np.uint8)
        cv2.floodFill(ff,mk,(0,0),2); al=np.where(ff[1:-1,1:-1]==1,1,al)
        o=Image.fromarray(np.dstack([np.asarray(im),(al*255).astype(np.uint8)])); o=o.crop(o.getbbox())
    o.save(f'{SRC}/{b}-recorte.webp',quality=86,method=6); os.remove(f'{SRC}/{b}.webp'); hechos[b]=1
s=open(R+'/data/catalogo.js').read()
for b in hechos: s=s.replace(f'img/prendas/{b}.webp',f'img/prendas/{b}-recorte.webp')
open(R+'/data/catalogo.js','w').write(s)
print(len(hechos),'recortadas;',len(FOTO),'se quedan como foto')
