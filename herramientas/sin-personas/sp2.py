import glob, os, numpy as np, cv2
from PIL import Image, ImageDraw
SRC='/home/user/ropa/img/prendas'
for mf in sorted(glob.glob('masc_ropa/*.png')):
    b=os.path.basename(mf)[:-4]; im=Image.open(f'{SRC}/{b}.webp').convert('RGB'); W,H=im.size
    m=np.asarray(Image.open(mf)); sup=m[:m.shape[0]//3] if m.shape[0]>=H*2 else m
    sup=cv2.resize(sup,(W,H)); sup=(sup>100).astype(np.uint8)
    sup=cv2.morphologyEx(sup,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
    a=np.asarray(Image.open(f'masc_fino/{b}.png')).astype(np.float32)/255
    # borde fino del recortador dentro de la zona de la prenda (dilatada un poco para no perder bordes)
    zona=cv2.dilate(sup,np.ones((7,7),np.uint8))
    alfa=np.clip(a*1.3,0,1)*zona
    n,lab,st,_=cv2.connectedComponentsWithStats((alfa>.5).astype(np.uint8),8)
    if n>1:
        mx=st[1:,4].max(); keep=np.isin(lab,[i for i in range(1,n) if st[i,4]>=mx*0.25]); alfa[~keep]=0
    o=Image.fromarray(np.dstack([np.asarray(im),(alfa*255).astype(np.uint8)]))
    if o.getbbox(): o=o.crop(o.getbbox())
    o.save(f'sinpersona/{b}.png')
fs=sorted(glob.glob('sinpersona/*.png')); W,H=150,190; cols=12
s=Image.new('RGB',(cols*W,((len(fs)+cols-1)//cols)*(H+14)),(30,26,32))
for i,f in enumerate(fs):
    im=Image.open(f).convert('RGBA'); im.thumbnail((W-8,H-8)); x,y=(i%cols)*W,(i//cols)*(H+14)
    s.paste(im,(x+4,y+4),im); ImageDraw.Draw(s).text((x+3,y+H),os.path.basename(f)[:-4][:24],fill='white',font_size=10)
s.save('sinpersona_hoja.jpg',quality=80)
