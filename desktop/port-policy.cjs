// A changed origin hides Chromium localStorage and IndexedDB; never silently switch it.
function portCandidates(saved, hasRecord, candidates, preserveOrigin) {
  const valid = Number.isInteger(saved) && saved > 1023 && saved < 65536;
  if (preserveOrigin && hasRecord && !valid) throw Error('No se puede determinar el puerto anterior. Conserva los datos de la aplicación y revisa studio-port.json antes de continuar.');
  return [...new Set(preserveOrigin && valid ? [saved] : [saved, ...candidates])].filter(p => Number.isInteger(p) && p > 1023 && p < 65536);
}
module.exports={portCandidates};
