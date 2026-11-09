const countries = {
  AR: "Argentina", BO: "Bolivia", CL: "Chile", CO: "Colombia", CR: "Costa Rica",
  CU: "Cuba", DO: "República Dominicana", EC: "Ecuador", ES: "España",
  GQ: "Guinea Ecuatorial", GT: "Guatemala", HN: "Honduras", MX: "México",
  NI: "Nicaragua", PA: "Panamá", PE: "Perú", PR: "Puerto Rico", PY: "Paraguay",
  SV: "El Salvador", US: "Estados Unidos", UY: "Uruguay", VE: "Venezuela",
};

// Spanish Neural voices listed by Microsoft's current language catalog.
const names = `
es-AR Elena Tomas
es-BO Sofia Marcelo
es-CL Catalina Lorenzo
es-CO Salome Gonzalo
es-CR Maria Juan
es-CU Belkys Manuel
es-DO Ramona Emilio
es-EC Andrea Luis
es-ES Alvaro Abril Arnau Dario Elias Elvira Estrella Irene Laia Lia Nil Saul Teo Triana Vera Ximena
es-GQ Teresa Javier
es-GT Marta Andres
es-HN Karla Carlos
es-MX Dalia Jorge Beatriz Candela Carlota Cecilio Gerardo Larissa Liberto Luciano Marina Nuria Pelayo Renata Yago
es-NI Yolanda Federico
es-PA Margarita Roberto
es-PE Camila Alex
es-PR Karina Victor
es-PY Tania Mario
es-SV Lorena Rodrigo
es-US Paloma Alonso
es-UY Valentina Mateo
es-VE Paola Sebastian
`.trim();

export const freeVoices = names.split("\n").flatMap((line) => {
  const [locale, ...people] = line.trim().split(/\s+/);
  const country = countries[locale.slice(3)];
  return people.map((person) => ({
    id: `${locale}-${person}Neural`,
    name: `${person} · ${country}`,
    language: locale,
    provider: "edge",
    engine: "Microsoft Edge TTS",
    source: "https://github.com/rany2/edge-tts",
    requiresKey: false,
  }));
});
