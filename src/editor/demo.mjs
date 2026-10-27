import { loadImage } from './images.mjs';
// Original vector illustrations bundled with the app; no network or third-party image license required.
const scenes = [
  `<defs><linearGradient id="wall" x2="1" y2="1"><stop stop-color="#e5ddc9"/><stop offset="1" stop-color="#baac91"/></linearGradient><linearGradient id="floor" x2="1" y2="1"><stop stop-color="#ded1b6"/><stop offset="1" stop-color="#9f927c"/></linearGradient><linearGradient id="view" x2="0" y2="1"><stop stop-color="#a5bcba"/><stop offset="1" stop-color="#d3d5b8"/></linearGradient></defs><path fill="url(#wall)" d="M0 0h1600v760H0z"/><path fill="url(#floor)" d="M0 760h1600v340H0z"/><path fill="#d4c6aa" d="M0 0h280v760L0 880z"/><path fill="#9b8d75" d="M305 760V310a240 240 0 0 1 480 0v450z"/><path fill="url(#view)" d="M340 760V320a205 205 0 0 1 410 0v440z"/><path fill="#829c86" d="M340 600q150-250 410-90v250H340z"/><path fill="#a6b49a" d="M340 640q200-180 410-80v200H340z"/><path fill="#e0d0b0" d="M531 112h12v648h-12zM340 400h410v12H340z"/><path fill="#efe4c7" opacity=".45" d="m340 760 410 0 600 340H660z"/><path fill="#6a6656" opacity=".15" d="m950 840 340-25 220 100-450 60z"/><path fill="#a69779" d="M1030 510h245v345h-245z"/><path fill="#d9caae" d="m1030 510 45-24h245l-45 24z"/><path fill="#8e826b" d="m1275 510 45-24v343l-45 26z"/><ellipse cx="1155" cy="475" rx="85" ry="25" fill="#7e7b67" opacity=".25"/><path fill="#ede0c4" d="M1100 470c-75-130 140-160 90-20l-30 35z"/><ellipse cx="650" cy="873" rx="190" ry="52" fill="#77705a" opacity=".18"/><path d="m530 720-35 170m190-170 40 170M510 760h190" stroke="#554f3e" stroke-width="18"/><rect x="490" y="620" width="220" height="140" rx="50" fill="#777c58"/><rect x="480" y="735" width="240" height="42" rx="20" fill="#969977"/><path d="M1450 780V420" stroke="#647453" stroke-width="12"/><path d="M1450 650q-150-15-115-125 100 25 115 125M1450 580q145-15 110-125-100 25-110 125M1450 500q-120-70-60-145 100 60 60 145" fill="#71866a"/><path fill="#aa957b" d="M1380 740h140l-25 120h-90z"/>`,
  `<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#a5bfbc"/><stop offset="1" stop-color="#e5e4cb"/></linearGradient><linearGradient id="stone" x2="1" y2="1"><stop stop-color="#e5d8bd"/><stop offset="1" stop-color="#b5a284"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h1600v1100H0z"/><path fill="#c4c3a6" d="M0 850h1600v250H0z"/><path fill="#e8dcc4" d="M180 150h1000v700H180z"/><path fill="url(#stone)" d="m1180 150 260 130v570h-260z"/><path fill="#cfbea0" d="M230 200h900v650H230z"/><path fill="#dbccb0" d="M285 240h790v610H285z"/><path fill="#756f5b" d="M350 850V440a130 130 0 0 1 260 0v410zM740 850V440a130 130 0 0 1 260 0v410z"/><path fill="#a1b3a1" d="M375 850V445a105 105 0 0 1 210 0v405zM765 850V445a105 105 0 0 1 210 0v405z"/><path fill="#566f62" d="M375 650q130-100 210-80v280H375zM765 700q140-130 210-70v220H765z"/><path fill="#c6b795" d="M475 340h10v510h-10zM865 340h10v510h-10z"/><path fill="#f3e9cf" d="M140 850h1340v35H140zM100 885h1420v40H100zM60 925h1500v45H60z"/><path fill="#9f9d80" opacity=".3" d="m1480 850 120 180H510l-370-145z"/><path fill="#b3b395" d="M0 1010h1600v90H0z"/><path d="M40 950V560m0 170q200-50 120-200Q20 590 40 730m0-70Q-80 570-25 470q100 60 65 190" stroke="#6f8062" stroke-width="25" fill="#819370"/>`,
  `<defs><linearGradient id="wall" x2="1" y2="1"><stop stop-color="#d8cfb2"/><stop offset="1" stop-color="#a8a58a"/></linearGradient><linearGradient id="water" x2="1" y2="1"><stop stop-color="#84ada7"/><stop offset="1" stop-color="#416e6c"/></linearGradient></defs><path fill="url(#wall)" d="M0 0h1600v1100H0z"/><path fill="#c1b99b" d="M0 730h1600v370H0z"/><path fill="#f0e3bf" d="M170 0h150v760H170zM650 0h150v760H650zM1130 0h150v760h-150z"/><path fill="#7b8a71" d="M320 0h330v730H320zM800 0h330v730H800zM1280 0h320v730h-320z"/><path fill="#bbc7a8" d="M320 0h330v510H320zM800 0h330v510H800zM1280 0h320v510h-320z"/><path fill="#a1b597" d="M320 440q130-280 330-160v450H320zM800 380q150-170 330-130v480H800zM1280 410q180-290 320-200v520h-320z"/><path fill="#d4caa6" d="M0 0h1600v170H0z"/><path fill="#efe4c5" d="M0 145h1600v35H0z"/><path fill="#c8bd9a" d="m0 760 1600 0v60H0z"/><path fill="#9d967d" d="m210 820 1390 0v280H0z"/><path fill="url(#water)" d="m245 845 1355 0v255H70z"/><g fill="none" stroke="#acc9b5" stroke-width="3" opacity=".5"><path d="m280 880 1250 50M220 920l1200 45M170 965l1230 50M120 1020l1200 35M100 1070l1200 15"/></g><path fill="#e3d4ad" opacity=".25" d="m650 845 150 0-90 255H480zM1130 845h150l-60 255h-180z"/>`
];
export async function demoImages() {
  const names = ['光影之间 · 客厅', '静谧秩序 · 建筑', '绿意回廊 · 庭院'];
  const result = [];
  for (let i = 0; i < scenes.length; i++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">${scenes[i]}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = await loadImage(url), canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1100;
      canvas.getContext('2d').drawImage(image, 0, 0);
      result.push({ name: names[i], src: canvas.toDataURL('image/png'), width: 1600, height: 1100 });
    } finally { URL.revokeObjectURL(url); }
  }
  return result;
}

export async function annotationDemoImages() {
  const result = [];
  for (const [name, light, dark] of [['苔绿', '#8b9977', '#526548'], ['暖白', '#e6dfcd', '#aaa18a'], ['陶土', '#c58e70', '#925f47']]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">
      <defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="#f4f1e9"/><stop offset="1" stop-color="#e9e4d9"/></linearGradient><linearGradient id="metal"><stop stop-color="${dark}"/><stop offset=".45" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient><linearGradient id="shade" x2="1" y2=".2"><stop stop-color="${dark}"/><stop offset=".48" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient><radialGradient id="glow"><stop stop-color="#fff1ce" stop-opacity=".9"/><stop offset="1" stop-color="#fff1ce" stop-opacity="0"/></radialGradient><radialGradient id="shadow"><stop stop-color="#5e6650" stop-opacity=".19"/><stop offset="1" stop-color="#5e6650" stop-opacity="0"/></radialGradient></defs>
      <path fill="url(#bg)" d="M0 0h1600v1100H0z"/>
      <ellipse cx="823" cy="850" rx="380" ry="105" fill="url(#shadow)"/><ellipse cx="802" cy="690" rx="270" ry="170" fill="url(#glow)"/>
      <path d="M822 831q45 67 139 73t170 44" fill="none" stroke="#a7a48f" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="802" cy="830" rx="195" ry="38" fill="${dark}"/><ellipse cx="802" cy="819" rx="195" ry="37" fill="${light}"/><ellipse cx="802" cy="813" rx="176" ry="25" fill="url(#shade)"/>
      <rect x="789" y="421" width="26" height="397" rx="12" fill="url(#metal)"/>
      <path d="M590 451C616 298 660 223 802 223S988 298 1014 451Q802 505 590 451Z" fill="url(#shade)"/>
      <ellipse cx="802" cy="451" rx="212" ry="32" fill="${dark}"/><ellipse cx="802" cy="448" rx="192" ry="19" fill="#f2dfb7"/>
      <path d="M659 336q31-76 94-84" fill="none" stroke="white" stroke-opacity=".1" stroke-width="12" stroke-linecap="round"/>
    </svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = await loadImage(url), canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1100;
      canvas.getContext('2d').drawImage(image, 0, 0); result.push({ name: `弧光台灯 · ${name}`, src: canvas.toDataURL('image/png'), width: 1600, height: 1100 });
    } finally { URL.revokeObjectURL(url); }
  }
  return result;
}
