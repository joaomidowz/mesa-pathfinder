// Marca d'água do comprador nos PDFs ("Licenciado para Nome, e-mail", grudada no texto da página): achar, tirar e conferir
// que não sobrou nada. O texto extraído vai para a busca, que a mesa toda lê — nome e e-mail do comprador não podem ir junto.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[a-z]{2,3}){1,2}/g;
const PUBLISHER_EMAIL = /@newordereditora\.com(?:\.br)?$/i;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namePattern = name => name.split(' ').map(escape).join('\\s+');

// Pares (nome, e-mail) da marca. O e-mail costuma vir grudado na palavra seguinte ("…@gmail.comPólvora"): só vale a
// ocorrência em que algo que não é letra minúscula fecha o domínio; depois o e-mail exato sai de todo lugar.
export function watermarks(text) {
  const found = new Map();
  for (const m of text.matchAll(/Licenciad[oa]\s+para:?\s*([^,\n]{2,80}?)\s*,\s*([\w.+-]+@[\w-]+(?:\.[a-z]{2,3}){1,2})(?=[^a-z]|$)/g)) {
    found.set(m[1].trim().replace(/\s+/g, ' ') + '\n' + m[2], true);
  }
  return [...found.keys()].map(key => { const [name, email] = key.split('\n'); return { name, email }; });
}
export function stripWatermarks(text, marks) {
  for (const { name, email } of marks) {
    text = text.replace(new RegExp('Licenciad[oa]\\s+para:?\\s*' + namePattern(name) + '\\s*,?\\s*' + escape(email), 'g'), '')
      .replace(new RegExp(escape(email), 'g'), '')
      .replace(new RegExp('Licenciad[oa]\\s+para:?\\s*' + namePattern(name) + ',?', 'g'), '');
  }
  return text;
}
// Lança erro (sem repetir o dado pessoal) se sobrou "Licenciado para", e-mail que não é da editora ou o nome do comprador.
export function assertClean(where, text, marks) {
  const problems = new Set();
  if (/licenciad[oa]\s+para/i.test(text)) problems.add('"Licenciado para"');
  for (const m of text.matchAll(EMAIL)) if (!PUBLISHER_EMAIL.test(m[0])) problems.add('e-mail pessoal');
  for (const { name } of marks) if (new RegExp(namePattern(name), 'i').test(text)) problems.add('nome do comprador');
  if (problems.size) throw new Error(`${where}: sobrou marca d'água (${[...problems].join(', ')}). Nada foi gravado.`);
}
