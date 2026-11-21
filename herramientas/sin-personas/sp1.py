import glob, os, sys, numpy as np
from PIL import Image
from rembg import remove, new_session
SRC='/home/user/ropa/img/prendas'; modo=sys.argv[1]
s=new_session('u2net_cloth_seg' if modo=='ropa' else 'birefnet-general-lite')
os.makedirs('masc_'+modo,exist_ok=True)
for f in sorted(glob.glob(SRC+'/*.webp')):
    b=os.path.basename(f)
    if not b.rsplit('-',1)[1].split('.')[0].isdigit() or os.path.exists(f'masc_{modo}/{b[:-5]}.png'): continue
    im=Image.open(f).convert('RGB')
    remove(im,session=s,only_mask=True).convert('L').save(f'masc_{modo}/{b[:-5]}.png'); print(b,flush=True)
