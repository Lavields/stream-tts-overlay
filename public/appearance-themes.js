// Each theme supplies a complete palette for both system color schemes.
export const appearanceThemes = {
  'azul-hielo': { name:'Azul nocturno y hielo', light:{background:'#eff5fc',foreground:'#14274a',accent:'#285fdb'}, dark:{background:'#08142b',foreground:'#edf4ff',accent:'#558bff'} },
  'grafito-violeta': { name:'Grafito y violeta', light:{background:'#f7f4fa',foreground:'#28223a',accent:'#7040b5'}, dark:{background:'#15151f',foreground:'#f4efff',accent:'#ad85ed'} },
  'bosque-menta': { name:'Bosque y menta', light:{background:'#f6f6ee',foreground:'#18392d',accent:'#237a55'}, dark:{background:'#0b1c16',foreground:'#eaf8ef',accent:'#65d99b'} },
  'calido-coral': { name:'Cálido y coral', light:{background:'#fff3eb',foreground:'#472a25',accent:'#cf5b49'}, dark:{background:'#231c1b',foreground:'#fff0e9',accent:'#ff8b75'} },
  'pizarra-turquesa': { name:'Pizarra y turquesa', light:{background:'#edf6fa',foreground:'#163449',accent:'#007b87'}, dark:{background:'#0b202c',foreground:'#e9faff',accent:'#39d0d7'} },
  'indigo-ambar': { name:'Índigo y ámbar', light:{background:'#faf7f1',foreground:'#182342',accent:'#97600c'}, dark:{background:'#0a142b',foreground:'#fff6e7',accent:'#f3bd58'} },
  'rosa-ciruela': { name:'Rosa y ciruela', light:{background:'#fff3f6',foreground:'#471b34',accent:'#b62e6c'}, dark:{background:'#270f20',foreground:'#fff0f6',accent:'#f06b9d'} },
  'oceano-arena': { name:'Océano y arena', light:{background:'#faf6ed',foreground:'#15324a',accent:'#006da9'}, dark:{background:'#062139',foreground:'#f1f8ff',accent:'#49b7ec'} },
  'cobre-petroleo': { name:'Cobre y petróleo', light:{background:'#f5f0eb',foreground:'#2e2927',accent:'#ac5429'}, dark:{background:'#091e24',foreground:'#f9f3ee',accent:'#ee9a68'} },
  'monocromo-lima': { name:'Monocromo y lima', light:{background:'#f5f6f4',foreground:'#20261c',accent:'#4e7800'}, dark:{background:'#171a18',foreground:'#f6faed',accent:'#a6d923'} },
};
export function appearancePalette(theme, mode) {
  return appearanceThemes[theme]?.[mode] || null;
}
