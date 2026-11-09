import { bundledSounds } from "./bundled-sounds.js";
// Small procedural effects: no downloads, sample packs, or voice API calls.
export const soundEffects = [
  { id: 1, name: 'Campanita', duration: .9, notes: [[0,880,.7,.25],[.03,1320,.65,.1]] },
  { id: 2, name: 'Éxito', duration: .9, notes: [[0,523,.22,.24],[.18,659,.22,.24],[.36,784,.42,.24]] },
  { id: 3, name: 'Error de videojuego', duration: .65, notes: [[0,180,.25,.2,120],[.28,120,.28,.2,70]] },
  { id: 4, name: 'Salto elástico', duration: .6, notes: [[0,180,.5,.3,780]] },
  { id: 5, name: 'Redoble corto', duration: 1, noise: Array.from({length:12},(_,i)=>[i*.065,.08,.22+i*.008]) },
  { id: 6, name: 'Burbujeo', duration: 1.1, notes: [[0,350,.15,.2,700],[.22,500,.14,.2,950],[.5,250,.2,.24,800],[.8,650,.16,.18,1100]] },
  { id: 7, name: 'Alarma corta', duration: 1.3, notes: [[0,650,.3,.2,950],[.4,650,.3,.2,950],[.8,650,.3,.2,950]] },
  { id: 8, name: 'Misterio', duration: 1.6, notes: [[0,220,1.4,.14],[0,233,1.4,.12],[.1,330,1.3,.08]] },
  { id: 9, name: 'Láser', duration: .6, notes: [[0,1700,.5,.24,100]] },
  { id: 10, name: 'Golpe de caricatura', duration: .65, notes: [[0,160,.45,.3,35]], noise:[[0,.13,.26]] },
  // Original recreations of classic cartoon Foley and musical stings.
  { id: 11, name: 'Silbido de caída al vacío', duration: 1.6, notes: [[0,2100,1.35,.22,190,{wave:'whistle',vibrato:.025}]] },
  { id: 12, name: 'Silbido de despegue', duration: 1.2, notes: [[0,300,.95,.23,2300,{wave:'whistle'}]] },
  { id: 13, name: 'Resorte enloquecido', duration: 1.4, notes: [[0,120,.6,.28,460,{wave:'rubber',vibrato:.2,vibratoHz:15}],[.55,350,.6,.2,100,{wave:'rubber',vibrato:.2,vibratoHz:12}]] },
  { id: 14, name: 'Boing, boing, boing', duration: 1.7, notes: [[0,120,.55,.3,420,{wave:'rubber'}],[.6,180,.42,.25,510,{wave:'rubber'}],[1.1,260,.35,.2,600,{wave:'rubber'}]] },
  { id: 15, name: 'Yunque en la cabeza', duration: 1.5, notes: [[0,110,.7,.3,50],[.02,740,1.2,.14,740,{wave:'bell'}],[.02,1037,.9,.09]], noise:[[0,.16,.3,{color:'low'}]] },
  { id: 16, name: 'Sartenazo metálico', duration: 1.3, notes: [[0,430,.9,.2,430,{wave:'bell'}],[0,677,1.1,.15],[0,1139,.7,.1]], noise:[[0,.09,.24]] },
  { id: 17, name: 'Tres martillazos', duration: 1.3, notes: [[0,140,.18,.28,60],[.38,150,.18,.28,65],[.76,110,.32,.3,40]], noise:[[0,.06,.25],[.38,.06,.25],[.76,.1,.28]] },
  { id: 18, name: 'Patinazo y frenazo', duration: 1.5, notes: [[0,1200,.85,.13,450,{wave:'reed',vibrato:.13,vibratoHz:24}],[.9,130,.2,.2,55]], noise:[[0,.95,.2,{color:'high'}],[.92,.1,.16]] },
  { id: 19, name: 'Carrera de patitas', duration: 1.7, notes: Array.from({length:16},(_,i)=>[i*.09,170+(i%2)*90,.065,.16,100]), noise:Array.from({length:16},(_,i)=>[i*.09,.045,.12,{color:'low'}]) },
  { id: 20, name: 'Arranque, carrera y frenada', duration: 1.2, notes: [[0,180,.7,.24,1100,{wave:'rubber'}]], noise:[[.05,.9,.25,{color:'high'}]] },
  { id: 21, name: 'Trombón de fracaso: wah wah', duration: 2.5, notes: [[0,294,.4,.22,277,{wave:'brass'}],[.45,277,.4,.22,247,{wave:'brass'}],[.9,247,.4,.22,220,{wave:'brass'}],[1.35,220,.95,.24,147,{wave:'brass',vibrato:.035}]] },
  { id: 22, name: 'Trompeta burlona', duration: 1.5, notes: [[0,392,.24,.22,392,{wave:'brass'}],[.27,392,.24,.22,392,{wave:'brass'}],[.55,294,.65,.24,260,{wave:'brass',vibrato:.04}]] },
  { id: 23, name: 'Violín de pena', duration: 2.6, notes: [[0,440,.7,.18,440,{wave:'bowed',vibrato:.018,decay:.5}],[.75,415,.7,.18,415,{wave:'bowed',vibrato:.018,decay:.5}],[1.5,392,.85,.18,349,{wave:'bowed',vibrato:.022,decay:.5}]] },
  { id: 24, name: 'Sorpresa de orquesta', duration: 1, notes: [[0,196,.55,.16,196,{wave:'brass'}],[0,247,.55,.14,247,{wave:'brass'}],[0,311,.55,.14,311,{wave:'brass'}],[.03,784,.65,.12]], noise:[[0,.12,.16]] },
  { id: 25, name: 'Ojos saltones', duration: 1.2, notes: [[0,350,.18,.25,1300,{wave:'rubber'}],[.28,430,.18,.23,1700,{wave:'rubber'}],[.55,1400,.4,.14,900,{wave:'bell'}]] },
  { id: 26, name: 'Mareo y estrellitas', duration: 2, notes: Array.from({length:9},(_,i)=>[i*.16,[1047,1319,1568,1976][i%4],.42,.13,undefined,{wave:'bell'}]) },
  { id: 27, name: 'Puerta que cruje', duration: 1.9, notes: [[0,180,1.5,.19,80,{wave:'reed',vibrato:.18,vibratoHz:7,decay:.7}]], noise:[[.1,1.45,.1,{color:'low'}]] },
  { id: 28, name: 'Giro de remolino', duration: 1.7, notes: [[0,500,1.35,.2,1300,{wave:'whistle',vibrato:.23,vibratoHz:9}],[.1,200,1.3,.13,800,{wave:'rubber',vibrato:.3,vibratoHz:11}]], noise:[[0,1.3,.12,{color:'high'}]] },
  { id: 29, name: 'Tropiezo por las teclas del piano', duration: 2.2, notes: Array.from({length:12},(_,i)=>[i*.12,1047*2**(-i/9),.55,.18,undefined,{wave:'piano'}]) },
  { id: 30, name: 'Ba dum tss', duration: 1.6, notes: [[0,140,.15,.27,70],[.24,140,.15,.27,70],[.53,85,.2,.28,40]], noise:[[0,.09,.18],[.24,.09,.18],[.53,.85,.27,{color:'high'}]] },
  { id: 31, name: 'Bocina de payaso', duration: 1.4, notes: [[0,392,.35,.25,350,{wave:'reed'}],[.4,294,.65,.27,260,{wave:'reed',vibrato:.03}]] },
  { id: 32, name: 'Grito de susto · Tom', duration: 1.1, notes: [[0,660,.16,.2,1700,{wave:'brass'}],[.18,220,.55,.23,110,{wave:'rubber'}]], noise:[[0,.08,.18]] },
  { id: 33, name: 'Pelota que rebota', duration: 1.9, notes: [[0,150,.25,.28,280,{wave:'rubber'}],[.65,190,.2,.23,340,{wave:'rubber'}],[1.1,240,.15,.18,400,{wave:'rubber'}],[1.4,300,.12,.14,460,{wave:'rubber'}],[1.6,350,.1,.1,520,{wave:'rubber'}]] },
  { id: 34, name: 'Explosión de caricatura', duration: 1.9, notes: [[0,90,.8,.28,25],[.18,340,.55,.15,100,{wave:'rubber'}]], noise:[[0,1.4,.5,{color:'low'}],[0,.28,.22]] },
  { id: 45, name: 'Monitor cardíaco', duration: 2.5, notes: [[0,1000,.12,.22],[1,1000,.12,.22],[2,1000,.12,.22]] },
  { id: 58, name: 'Caída cómica', duration: 1.8, notes: [[0,850,.65,.22,100],[.7,90,.34,.3,380],[1.05,260,.26,.22,100],[1.35,160,.24,.17,250]], noise:[[.68,.09,.14]] },
];
// Append file-only effects without manufacturing a synthetic substitute.
const proceduralIds = new Set(soundEffects.map(effect => effect.id));
for (const sample of Object.values(bundledSounds)) {
  if (!proceduralIds.has(sample.id)) soundEffects.push({
    id: sample.id, name: sample.catalogName || sample.name,
    duration: sample.duration, fileOnly: true,
  });
}
soundEffects.sort((a,b) => a.id - b.id);
export const soundEffectIds = new Set(soundEffects.map(effect => effect.id));
export const MAX_SOUND_EFFECTS = 6;
const timbres = {
  whistle: [[2,.06]], rubber: [[2,.23],[3,.08]], brass: [[2,.32],[3,.2],[4,.08]],
  bell: [[2.76,.25],[4.07,.12]], reed: [[3,.25],[5,.1]],
  bowed: [[2,.25],[3,.16],[4,.1],[5,.06]], piano: [[2,.25],[3,.11]],
};
export function createSoundBuffer(context, id) {
  const effect = soundEffects.find(effect => effect.id === Number(id));
  if (!effect) throw Error('Sonido no disponible.');
  if (effect.fileOnly) throw Error('Este efecto usa un archivo de audio incluido.');
  const rate = 22050;
  const buffer = context.createBuffer(1, Math.ceil(effect.duration * rate), rate);
  const samples = buffer.getChannelData(0);
  for (const [start, frequency, duration, amplitude, end = frequency, options = {}] of effect.notes || []) {
    const harmonics = (timbres[options.wave] || []).filter(([multiple]) => multiple * Math.max(frequency,end) < rate / 2);
    const weight = 1 + harmonics.reduce((sum,[,gain]) => sum+gain,0);
    const vibratoHz = options.vibratoHz || 6;
    for (let i = 0; i < Math.floor(duration * rate); i++) {
      const position = Math.floor(start * rate) + i;
      if (position >= samples.length) break;
      const t = i / rate;
      const envelope = Math.min(1, t / (options.wave === 'bowed' ? .05 : .008), (duration - t) / .025) * Math.exp(-(options.decay ?? 2) * t / duration);
      const phase = 2 * Math.PI * (frequency * t + (end - frequency) * t * t / (2 * duration))
        + frequency * (options.vibrato || 0) / vibratoHz * (1 - Math.cos(2 * Math.PI * vibratoHz * t));
      let tone = Math.sin(phase);
      for (const [multiple,gain] of harmonics) tone += gain * Math.sin(phase * multiple);
      samples[position] += amplitude * Math.max(0,envelope) * tone / weight;
    }
  }
  let seed = Number(id) + 1;
  for (const [start, duration, amplitude, options = {}] of effect.noise || []) {
    let smooth = 0;
    for (let i = 0; i < Math.floor(duration * rate); i++) {
      const position = Math.floor(start * rate) + i;
      if (position >= samples.length) break;
      seed = (1664525 * seed + 1013904223) >>> 0;
      const t = i / rate;
      const envelope = Math.min(1, t / .005, (duration - t) / .02) * Math.exp(-4 * t / duration);
      const noise = seed / 2147483648 - 1;
      smooth += .12 * (noise - smooth);
      const colored = options.color === 'low' ? smooth * 2 : options.color === 'high' ? noise - smooth : noise;
      samples[position] += colored * amplitude * Math.max(0,envelope);
    }
  }
  // A fixed ceiling prevents clipping; there is no changing gain within playback.
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak > .7) for (let i = 0; i < samples.length; i++) samples[i] *= .7 / peak;
  return buffer;
}
