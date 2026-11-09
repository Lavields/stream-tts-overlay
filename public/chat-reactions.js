import { soundEffectIds } from './sound-effects.js';
// Pronunciation spellings intentionally follow the studio owner's requests.
// Exact tokens only: never edit names inside words, URLs or email addresses.
export const streamPronunciations = Object.freeze({
 ctm:'conchetumadre', csm:'chesumare', ptm:'puctamare', alv:'a la velga',
 lpmqlp:'La pucta madre que lo parió', mrd:'mielda', wn:'hueón',
 qlia:'culiá', 'qliá':'culiao', xuxa:'chucha', puxa:'pucha', sexo:'setzo',
 sxo:'setzo', wea:'hueá', mmgv:'mamahuevo',
 // Common regional variants; do not infer insults from ordinary words.
 ctmr:'conchetumadre', ctmre:'conchetumadre', csmr:'chesumare',
 ptmr:'puctamare', ptmre:'puctamare', lpqtp:'la pucta que te parió',
 lpm:'la pucta madre', mrda:'mielda', hdp:'hijo de pucta',
 hpta:'hijo de pucta', wna:'hueona', weon:'hueón', 'weón':'hueón',
 weona:'hueona', qlo:'culiao', ql:'culiao', qla:'culiá',
});
// Frases que disparan un clip. Solo se activan si el sonido está cargado en bundled-sounds.js.
const phraseSoundCandidates = [
 {id:300, phrase:'mua', source:'mua'},
 {id:301, phrase:'smuack', source:'smuack'},
 {id:302, phrase:'ñiñiñi', source:'(?:ñi){3,}'},
 {id:303, phrase:'hay una mujer', source:'hay\\s+una\\s+mujer'},
 {id:304, phrase:'estoy cansado jefe', source:'estoy\\s+cansado\\s*[,;:]?\\s+jefe'},
 {id:305, phrase:'no tio no', source:'no\\s+t[ií]o\\s*[,;:]?\\s+no'},
];
export const phraseSoundTriggers = Object.freeze(phraseSoundCandidates.filter(r => soundEffectIds.has(r.id)));
export const CHAT_REACTION_SOURCE = ['mu[aá](?:ja){2,}','(?:ja){2,}',...phraseSoundTriggers.map(r=>r.source)].join('|');
export function chatReaction(value) {
 const token=value.toLocaleLowerCase('es').normalize('NFC');
 if (/^mu[aá](?:ja){2,}$/u.test(token)) return {expression:'evilLaugh',text:'Muá, ja, ja, ja.'};
 if (/^(?:ja){2,}$/u.test(token)) {
  const count=Math.min(6,token.length/2);
  return {expression:count===2?'chuckle':'laugh',text:Array(count).fill('Ja').join(', ')+'.'};
 }
 const trigger=phraseSoundTriggers.find(r=>new RegExp('^(?:'+r.source+')$','iu').test(token));
 return trigger ? {id:trigger.id} : null;
}
export function addPeruanoCompliment(value) {
 // End of a sentence or message only; not "peruano juega" or "peruanos".
 return String(value).split(/(https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,})/gi).map((part,index)=>index%2 ? part :
  part.replace(/(?<![\p{L}\p{N}\p{M}_])peruano(?=\s*(?:[.!?…]+["'»”)]*(?=\s|$)|["'»”)]*$))/giu,'peruano hermoso')
 ).join('');
}
export function expressionSpeech(segment, provider) {
 if(provider !== 'fish' || !segment.expression) return segment.text;
 const tag={chuckle:'[chuckling]',laugh:'[laughing]',evilLaugh:'[evil laughing]'}[segment.expression];
 return tag ? tag+' '+segment.text : segment.text;
}
