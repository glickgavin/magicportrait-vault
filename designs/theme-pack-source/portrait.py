"""A made-up sample pet portrait (illustrated, 'royal' style) for previews only."""
import random
from art import f

def dog_svg():
    rng = random.Random(7)
    tufts = "".join(
        f'<path d="M 0 -9 C 6 -2 6 6 0 10 C -6 6 -6 -2 0 -9 Z" fill="#1d1a1a" transform="translate({f(x)} {f(y)})"/>'
        for x, y in [(330, 955), (410, 1000), (500, 1030), (600, 1040), (700, 1030), (790, 1000), (870, 955),
                     (360, 1010), (455, 1050), (560, 1072), (650, 1072), (745, 1050), (840, 1010)])
    chain = "".join(
        f'<circle cx="{f(380 + i*22)}" cy="{f(965 + 115 * (1 - ((380 + i*22 - 600)/220)**2))}" r="8" fill="url(#gold)"/>'
        for i in range(21))
    fur = "".join(
        f'<path d="M {f(x)} {f(y)} q {f(rng.uniform(-6,6))} {f(rng.uniform(10,20))} {f(rng.uniform(-4,4))} {f(rng.uniform(22,34))}" '
        f'stroke="{rng.choice(["#a96d38", "#d9a066", "#b9783f"])}" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>'
        for x, y in [(rng.uniform(420, 780), rng.uniform(330, 520)) for _ in range(400)] if ((x-600)/235)**2+((y-560)/258)**2 < 0.72)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
<defs>
 <radialGradient id="bgr" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#5d7f76"/><stop offset="0.55" stop-color="#2f4541"/><stop offset="1" stop-color="#141c1a"/></radialGradient>
 <linearGradient id="cape" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a5182c"/><stop offset="1" stop-color="#4e0811"/></linearGradient>
 <radialGradient id="head" cx="45%" cy="30%" r="80%"><stop offset="0" stop-color="#e2a467"/><stop offset="0.6" stop-color="#c4853f"/><stop offset="1" stop-color="#8f5a2a"/></radialGradient>
 <linearGradient id="ear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4726"/><stop offset="1" stop-color="#4a2913"/></linearGradient>
 <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset="0.5" stop-color="#d9a93f"/><stop offset="1" stop-color="#8a6516"/></linearGradient>
 <filter id="blur40"><feGaussianBlur stdDeviation="40"/></filter>
 <filter id="soft"><feGaussianBlur stdDeviation="2.2"/></filter>
 <filter id="paint" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="9"/></filter>
 <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0.10 0"/></filter>
</defs>
<rect width="1200" height="1200" fill="url(#bgr)"/>
<g filter="url(#blur40)" opacity="0.55"><ellipse cx="300" cy="300" rx="220" ry="160" fill="#6f8f83"/><ellipse cx="950" cy="420" rx="200" ry="260" fill="#26332f"/><ellipse cx="620" cy="180" rx="260" ry="120" fill="#6a8a7e" opacity="0.5"/></g>
<g filter="url(#paint)">
 <path d="M 110 1200 C 150 1020 250 900 380 870 C 470 850 730 850 820 870 C 950 900 1050 1020 1090 1200 Z" fill="url(#cape)"/>
 <path d="M 300 1200 C 330 1080 360 1000 420 950" stroke="#3d060d" stroke-width="10" fill="none" opacity="0.5"/>
 <path d="M 900 1200 C 870 1080 840 1000 780 950" stroke="#3d060d" stroke-width="10" fill="none" opacity="0.5"/>
 <ellipse cx="600" cy="860" rx="215" ry="135" fill="#efe6d9"/>
 <path d="M 285 920 Q 600 1050 915 920 L 950 1010 Q 600 1150 250 1010 Z" fill="#f4efe7"/>
 {tufts}
 {chain}
 <circle cx="600" cy="1092" r="44" fill="url(#gold)" stroke="#7a5512" stroke-width="4"/>
 <path d="M 600 1066 L 607 1085 L 627 1086 L 611 1098 L 617 1118 L 600 1106 L 583 1118 L 589 1098 L 573 1086 L 593 1085 Z" fill="#fff6cf" opacity="0.9"/>
 <ellipse cx="600" cy="560" rx="235" ry="258" fill="url(#head)"/>
 {fur}
 <path d="M 575 360 C 560 460 520 560 498 650 C 480 770 720 770 702 650 C 680 560 640 460 625 360 Z" fill="#f3ebe0"/>
 <ellipse cx="600" cy="712" rx="128" ry="88" fill="#f5eee4"/>
 <path d="M 430 400 C 360 430 330 560 335 700 C 338 790 360 860 410 870 C 455 878 470 820 468 740 C 466 640 470 520 470 440 Z" fill="url(#ear)"/>
 <path d="M 770 400 C 840 430 870 560 865 700 C 862 790 840 860 790 870 C 745 878 730 820 732 740 C 734 640 730 520 730 440 Z" fill="url(#ear)"/>
 <path d="M 470 520 C 495 500 545 498 565 515" stroke="#8a5428" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.6"/>
 <path d="M 730 520 C 705 500 655 498 635 515" stroke="#8a5428" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.6"/>
 <g><ellipse cx="522" cy="562" rx="33" ry="36" fill="#2a170b"/><ellipse cx="522" cy="566" rx="22" ry="25" fill="#5b3418"/><ellipse cx="522" cy="568" rx="13" ry="15" fill="#0e0805"/><circle cx="511" cy="550" r="9" fill="#fff"/><circle cx="532" cy="580" r="4" fill="#fff" opacity="0.7"/></g>
 <g><ellipse cx="678" cy="562" rx="33" ry="36" fill="#2a170b"/><ellipse cx="678" cy="566" rx="22" ry="25" fill="#5b3418"/><ellipse cx="678" cy="568" rx="13" ry="15" fill="#0e0805"/><circle cx="667" cy="550" r="9" fill="#fff"/><circle cx="688" cy="580" r="4" fill="#fff" opacity="0.7"/></g>
 <path d="M 548 652 C 548 626 652 626 652 652 C 652 680 622 692 600 694 C 578 692 548 680 548 652 Z" fill="#1e1919"/>
 <ellipse cx="582" cy="642" rx="15" ry="8" fill="#fff" opacity="0.35"/>
 <path d="M 600 694 L 600 722 M 600 722 C 588 744 560 748 545 738 M 600 722 C 612 744 640 748 655 738" stroke="#3b2a22" stroke-width="6" fill="none" stroke-linecap="round"/>
 <path d="M 585 742 C 585 778 615 778 615 742 Z" fill="#d4646f"/>
</g>
<rect width="1200" height="1200" filter="url(#grain)"/>
</svg>'''
