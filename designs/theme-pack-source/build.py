"""Render every theme version: background JPEG, overlay PNG, layout JSON, previews, contact sheet."""
import json, os, sys, glob, io
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
import templates, portrait

ROOT = Path(__file__).parent
FONTS = ROOT / "fonts"
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)

FAMILY = {"dm-serif-display": "DM Serif Display", "plus-jakarta-sans": "Plus Jakarta Sans", "league-gothic": "League Gothic",
          "fredoka": "Fredoka", "caveat": "Caveat", "great-vibes": "Great Vibes", "fraunces": "Fraunces"}


def font_css():
    css = []
    for p in sorted(FONTS.glob("*.woff2")):
        name = p.name.replace(".woff2", "")
        fam = next(v for k, v in FAMILY.items() if name.startswith(k + "-latin"))
        parts = name.split("-")
        weight, style = parts[-2], parts[-1]
        css.append(f"@font-face{{font-family:'{fam}';src:url('{p.as_uri()}') format('woff2');font-weight:{weight};font-style:{style};}}")
    return "\n".join(css)


COMMON_DEFS = ('<radialGradient id="ballShade" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="0.25"/>'
               '<stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/></radialGradient>')

PREVIEW_JS = r"""
const L = window.LAYOUT, S = window.SAMPLE;
function shapeCss(p){ if(p.shape==='circle') return '50%'; if(p.shape==='rounded') return (p.radius||40)+'px';
  if(p.shape==='arch') return `${p.w/2}px ${p.w/2}px 0 0 / ${p.w/2}px ${p.w/2}px 0 0`; return '0'; }
const ph = document.getElementById('photo'), p = L.photo;
Object.assign(ph.style,{left:p.x+'px',top:p.y+'px',width:p.w+'px',height:p.h+'px',borderRadius:shapeCss(p)});
const fr = document.getElementById('frame');
Object.assign(fr.style,{left:p.x+'px',top:p.y+'px',width:p.w+'px',height:p.h+'px',borderRadius:shapeCss(p),
  boxShadow: (p.frame&&p.frame.width)?`inset 0 0 0 ${p.frame.width}px ${p.frame.color}`:'none'});
function zone(z, txt, multi){
  const d=document.createElement('div'); d.className='tz';
  Object.assign(d.style,{left:z.x+'px',top:z.y+'px',width:z.w+'px',fontFamily:`'${z.font}'`,color:z.color,textAlign:z.align||'center'});
  let size=z.size; const min=z.minSize||Math.round(z.size*0.7); d.textContent=txt; document.getElementById('c').appendChild(d);
  if(multi){ const lh=z.lineHeight||1.3; d.style.lineHeight=lh;
    const fits=()=>{ const lines=Math.round(d.scrollHeight/(size*lh)); return d.scrollHeight<=z.h+1 && lines<=(z.maxLines||99); };
    d.style.fontSize=size+'px'; while(!fits() && size>min){size--; d.style.fontSize=size+'px';}
    d.dataset.fit = fits() ? 'ok' : 'overflow'; const used=d.scrollHeight; d.style.height=z.h+'px'; d.style.overflow='hidden';
    if((z.valign||'top')==='middle'){ d.style.paddingTop=Math.max(0,(z.h-used)/2)+'px'; d.style.height=(z.h-Math.max(0,(z.h-used)/2))+'px'; }
  } else { d.style.whiteSpace='nowrap'; d.style.lineHeight=1.25; d.style.fontSize=size+'px';
    while(d.scrollWidth>z.w+1 && size>min){size--; d.style.fontSize=size+'px';}
    d.dataset.fit = d.scrollWidth<=z.w+1 ? 'ok':'overflow'; }
  d.dataset.size=size; return d;
}
const T=L.text;
zone(T.to, T.to.template.replace('{to}', S.to), false);
zone(T.message, S.message, true);
zone(T.from, T.from.template.replace('{from}', S.from), false);
if (window.GUIDES) {
  const gd=document.getElementById('guides'); gd.style.display='block';
  for (const z of [T.to, T.message, T.from]) { const b=document.createElement('div'); b.className='gbox';
    Object.assign(b.style,{left:z.x+'px',top:z.y+'px',width:z.w+'px',height:(z.h|| z.size*1.25)+'px'}); gd.appendChild(b); }
}
document.fonts.ready.then(()=>{ document.body.dataset.ready='1'; });
"""


def page(t, mode, sample=None, portrait_uri="", guides=False):
    show_bg = mode in ("background", "preview")
    show_ov = mode in ("overlay", "preview")
    preview = mode == "preview"
    body_bg = "transparent" if mode == "overlay" else "#ffffff"
    sample = sample or {"to": "Grandma Rose", "from": "Sam", "message": t["sample"]}
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
{font_css()}
html,body{{margin:0;padding:0;background:{body_bg};}}
#c{{position:relative;width:1500px;height:2100px;overflow:hidden;}}
#c > svg{{position:absolute;left:0;top:0;}}
#photo{{position:absolute;overflow:hidden;background:#cfd8d4;}}
#photo img{{width:100%;height:100%;object-fit:cover;display:block;}}
#frame{{position:absolute;pointer-events:none;}}
.tz{{position:absolute;}}
#guides{{display:none;position:absolute;inset:0;}}
#guides .gbox{{position:absolute;outline:3px dashed rgba(0,160,255,.9);}}
#guides .safe{{position:absolute;left:60px;top:60px;right:60px;bottom:60px;outline:3px dashed rgba(255,0,80,.8);}}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><defs>{COMMON_DEFS}{t['defs']}</defs></svg>
<div id="c">
{f'<svg width="1500" height="2100" viewBox="0 0 1500 2100">{t["bg"]}</svg>' if show_bg else ''}
{f'<div id="photo"><img src="{portrait_uri}"></div><div id="frame"></div>' if preview else ''}
{f'<svg width="1500" height="2100" viewBox="0 0 1500 2100">{t["overlay"]}</svg>' if show_ov else ''}
<div id="guides"><div class="safe"></div></div>
</div>
{f'<script>window.LAYOUT={json.dumps(t["layout"])};window.SAMPLE={json.dumps(sample)};window.GUIDES={str(guides).lower()};{PREVIEW_JS}</script>' if preview else '<script>document.fonts.ready.then(()=>{document.body.dataset.ready="1";});</script>'}
</body></html>"""


def main(only=None):
    tpls = [fn() for fn in templates.ALL]
    if only:
        tpls = [t for t in tpls if t["version"] in only]
    work = OUT / "_html"
    work.mkdir(exist_ok=True)
    (work / "portrait.svg").write_text(portrait.dog_svg())
    report = {}
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        pg = br.new_page(viewport={"width": 1500, "height": 2100}, device_scale_factor=1)
        # sample portrait PNG
        pg.set_content(f'<html><body style="margin:0">{portrait.dog_svg()}</body></html>')
        pg.set_viewport_size({"width": 1200, "height": 1200})
        pg.screenshot(path=str(work / "portrait.png"), clip={"x": 0, "y": 0, "width": 1200, "height": 1200})
        pg.set_viewport_size({"width": 1500, "height": 2100})
        puri = (work / "portrait.png").as_uri()
        for t in tpls:
            slug = f'{t["theme"]}-{t["version"]}'
            d = OUT / t["theme"] / t["version"]
            d.mkdir(parents=True, exist_ok=True)
            r = {}
            for mode in ("background", "overlay", "preview", "guides"):
                html = page(t, "preview" if mode == "guides" else mode, portrait_uri=puri, guides=(mode == "guides"))
                hp = work / f"{slug}-{mode}.html"
                hp.write_text(html)
                pg.goto(hp.as_uri())
                pg.wait_for_selector("body[data-ready='1']", state="attached", timeout=20000)
                pg.wait_for_timeout(150)
                png = work / f"{slug}-{mode}.png"
                pg.screenshot(path=str(png), clip={"x": 0, "y": 0, "width": 1500, "height": 2100}, omit_background=(mode == "overlay"))
                if mode == "preview":
                    r["fit"] = pg.eval_on_selector_all(".tz", "els=>els.map(e=>[e.dataset.fit,e.dataset.size])")
            if not t["overlay"]:
                r["overlay"] = False
            im = Image.open(work / f"{slug}-background.png").convert("RGB")
            im.save(d / f"{slug}-background.jpg", "JPEG", quality=90, optimize=True, progressive=True)
            if t["overlay"]:
                ov = Image.open(work / f"{slug}-overlay.png").convert("RGBA")
                ov.save(d / f"{slug}-overlay.png", optimize=True)
            pv = Image.open(work / f"{slug}-preview.png").convert("RGB")
            pv.resize((750, 1050), Image.LANCZOS).save(d / f"{slug}-preview.jpg", "JPEG", quality=88, optimize=True)
            pv.save(work / f"{slug}-preview-full.jpg", "JPEG", quality=90)
            Image.open(work / f"{slug}-guides.png").convert("RGB").resize((750, 1050), Image.LANCZOS).save(work / f"{slug}-guides.jpg", quality=85)
            (d / "layout.json").write_text(json.dumps(t["layout"], indent=2) + "\n")
            r["sizes_kb"] = {p.name: round(p.stat().st_size / 1024) for p in d.iterdir()}
            report[slug] = r
            print(slug, r, flush=True)
        br.close()
    (OUT / "report.json").write_text(json.dumps(report, indent=2))
    meta = [{k: t[k] for k in ("theme", "version", "name", "audience", "ideas", "sample")} for t in tpls]
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:] or None)
