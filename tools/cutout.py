from PIL import Image
import numpy as np, sys, os
from collections import deque

def label_components(mask):
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    comps = []
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not seen[y, x]:
                dq = deque([(y, x)]); seen[y, x] = True; pix = [(y, x)]
                while dq:
                    cy, cx = dq.popleft()
                    for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; dq.append((ny, nx)); pix.append((ny, nx))
                comps.append(pix)
    return comps

def remove_bg(im, tol=20, min_hole=24):
    im = im.convert('RGBA')
    a = np.array(im)
    rgb = a[:, :, :3].astype(np.int16)
    h, w = rgb.shape[:2]
    white = (rgb.min(axis=2) > 255 - tol)
    # 1) background = white component touching the border
    border = np.zeros((h, w), dtype=bool)
    border[0, :] = border[-1, :] = True; border[:, 0] = border[:, -1] = True
    comps = label_components(white)
    bg = np.zeros((h, w), dtype=bool)
    for pix in comps:
        ys = [p[0] for p in pix]; xs = [p[1] for p in pix]
        touches = (0 in ys) or (h-1 in ys) or (0 in xs) or (w-1 in xs)
        if touches:
            for p in pix: bg[p[0], p[1]] = True
        elif len(pix) >= min_hole:
            for p in pix: bg[p[0], p[1]] = True   # enclosed background hole
    a[:, :, 3] = np.where(bg, 0, a[:, :, 3])
    # 2) de-fringe bright near-white pixels touching transparency
    bright = (rgb.min(axis=2) > 222) & (rgb.max(axis=2) - rgb.min(axis=2) < 22)
    al = a[:, :, 3]
    for _ in range(2):
        trans = al == 0
        nb = np.zeros_like(trans)
        nb[1:, :] |= trans[:-1, :]; nb[:-1, :] |= trans[1:, :]
        nb[:, 1:] |= trans[:, :-1]; nb[:, :-1] |= trans[:, 1:]
        al[nb & bright] = 0
    return Image.fromarray(a, 'RGBA')

if __name__ == '__main__':
    src = sys.argv[1]
    im = remove_bg(Image.open(src))
    bbox = im.getbbox()
    print('bbox', bbox, 'size', im.size)
    out = im.crop(bbox)
    out.save(os.path.splitext(src)[0] + '_cut.png')
    print('cut', out.size)
