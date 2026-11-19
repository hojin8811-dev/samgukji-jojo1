from PIL import Image, ImageDraw, ImageFont
import sys
W,H,TW,TH = 1440,1200,12,10
tw,th = W//TW, H//TH
for name in sys.argv[1:]:
    im = Image.open(f'assets/maps/{name}.png').convert('RGB').resize((W,H), Image.LANCZOS)
    d = ImageDraw.Draw(im, 'RGBA')
    for y in range(TH):
        for x in range(TW):
            d.rectangle([x*tw, y*th, (x+1)*tw-1, (y+1)*th-1], outline=(255,255,0,110), width=2)
            # sample avg color
            box = im.crop((x*tw+10, y*th+10, (x+1)*tw-10, (y+1)*th-10)).resize((1,1), Image.BOX).getpixel((0,0))
            d.text((x*tw+8, y*th+6), f'{x},{y}', fill=(255,255,255,230))
            d.text((x*tw+8, y*th+20), str(box), fill=(255,255,0,240))
    im.save(f'/tmp/grid_{name}.png')
    print(name, 'ok')
