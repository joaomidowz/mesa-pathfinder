// Adaptação automática das entradas dos livros legados (de antes do Remaster) às regras atualizadas.
// Base: o quadro "Regras atualizadas" das primeiras páginas de Fúria dos Elementos, com os termos que os livros
// Remaster (Livros do Jogador 1 e 2, Livro do Mestre) usam de fato, contados no texto extraído. Ver docs/remaster.md.
// Funções puras: recebem uma entrada (ou um texto) e devolvem o resultado, sem ler arquivo nem banco.
//
// adaptarRemaster(entry) muta e devolve a entrada com traços e textos adaptados, `legacy: true` e `remaster: string[]`
// (frases curtas, únicas e em ordem estável do que mudou nela). name, book, page, level e type não mudam.

// ---------- utilidades ----------
const B = '(?<!\\p{L})'; // começo de palavra (letras com acento contam; \b do JS não serve)
const E = '(?!\\p{L})'; // fim de palavra
const rx = (source, flags = 'giu') => new RegExp(source, flags);
const deaccent = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const squeeze = s => deaccent(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const collate = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });

// Copia a caixa do termo original para o novo (dado em minúsculas): CAIXA ALTA, Título (duas ou mais iniciais
// maiúsculas, inclusive coladas: "AtaquedeOportunidade"), Frase (só a primeira) ou minúsculas.
const SMALL_WORDS = new Set(['a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos']);
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
export function matchCase(source, target) {
  const letters = source.replace(/[^\p{L}]/gu, '');
  if (letters.length > 1 && letters === letters.toUpperCase()) return target.toUpperCase();
  const capitals = (source.match(/(?:^|[^\p{L}])\p{Lu}|\p{Ll}\p{Lu}/gu) || []).length;
  if (capitals >= 2) return target.split(' ').map((word, i) => (i && SMALL_WORDS.has(word) ? word : capitalize(word))).join(' ');
  return /^\p{Lu}/u.test(source) ? capitalize(target) : target;
}

// Lista de mudanças sem repetição, na ordem em que aparecem.
function collector() {
  const list = [];
  return { list, add: message => { if (!list.includes(message)) list.push(message); } };
}

// Trechos que nenhuma regra seguinte pode tocar (o "Plano de Energia Positiva", o "caótico" de uma fraqueza) viram
// marcadores e voltam no fim.
function vault() {
  const kept = [];
  return {
    keep: s => `${kept.push(s) - 1}`,
    restore: text => text.replace(/(\d+)/g, (_, i) => kept[Number(i)]),
  };
}

// Forma de dicionário de uma palavra legada, para escolher a troca ("Negativa" → "negativo", "caóticas" → "caotico",
// "cegos" → "cego"); null quando não é uma delas (as escolas de magia, por exemplo).
const LEGACY_STEMS = [['positiv', 'positivo'], ['negativ', 'negativo'], ['bondos', 'bondoso'], ['malign', 'maligno'],
  ['caotic', 'caotico'], ['ordeir', 'ordeiro'], ['ceg', 'cego'], ['surd', 'surdo'], ['lent', 'lento']];
const legacyKey = word => LEGACY_STEMS.find(([stem]) => squeeze(word).startsWith(stem))?.[1] ?? null;
const LABEL = { positivo: 'positivo', negativo: 'negativo', bondoso: 'bondoso', maligno: 'maligno', caotico: 'caótico', ordeiro: 'ordeiro' };

// positivo/negativo com gênero e número: "negativa" → "eversiva", "positivos" → "vitais".
function swapPolarity(word) {
  const m = word.match(/^(positiv|negativ)([oa])(s?)$/iu);
  if (!m) return word;
  const plural = Boolean(m[3]);
  const target = /^p/i.test(m[1]) ? (plural ? 'vitais' : 'vital') : `eversiv${m[2].toLowerCase()}${plural ? 's' : ''}`;
  return matchCase(word, target);
}

// ---------- traços ----------
const RARITIES = new Set(['comum', 'incomum', 'raro', 'unico']);
const SIZES = new Set(['minusculo', 'pequeno', 'medio', 'grande', 'enorme', 'imenso']);
// Siglas de tendência (O/N/C + B/N/M; "NN" é erro de digitação do Bestiário 2) e os valores que ocupam o lugar
// da tendência antes do tamanho ("QUALQUER", "VARIA").
const ALIGNMENT_ABBR = new Set(['OB', 'ON', 'OM', 'NB', 'N', 'NM', 'CB', 'CN', 'CM', 'NN']);
const ALIGNMENT_SLOT = new Set(['QUALQUER', 'VARIA']);
// Traços de tendência como aparecem nos livros legados (linha de traços e listas entre parênteses), mais sobras em inglês.
const ALIGNMENT_TRAITS = new Set(['bem', 'bom', 'bondoso', 'mal', 'mau', 'maligno', 'caotico', 'ordeiro', 'good', 'evil', 'chaotic', 'lawful']);
// Escolas de magia (a ilusão continua: tem regras especiais no Remaster).
const SCHOOL_TRAITS = new Set(['abjuracao', 'adivinhacao', 'conjuracao', 'encantamento', 'evocacao', 'necromancia', 'transmutacao',
  'abjuration', 'divination', 'conjuration', 'enchantment', 'evocation', 'necromancy', 'transmutation']);
// Nos Livros do Jogador os traços são VITALIDADE e EVERSÃO (nunca "VITAL"/"EVERSIVO" na linha de traços).
const ENERGY_TRAITS = { positivo: 'VITALIDADE', negativo: 'EVERSÃO', positive: 'VITALIDADE', negative: 'EVERSÃO' };
// Como no Livro dos Monstros: ínferos são profanos, celestiais são sagrados.
const HOLY_BY_TRAIT = [['infero', 'PROFANO'], ['celestial', 'SAGRADO']];

// Põe o traço na ordem alfabética depois de raridade e tamanho (como nas linhas de traços do Remaster); não duplica.
function insertTrait(traits, trait) {
  if (traits.some(t => squeeze(t) === squeeze(trait))) return false;
  let i = 0;
  while (i < traits.length && (RARITIES.has(squeeze(traits[i])) || SIZES.has(squeeze(traits[i])))) i++;
  while (i < traits.length && collate(traits[i], trait) <= 0) i++;
  traits.splice(i, 0, trait);
  return true;
}

export function adaptarTracos(traits) {
  const log = collector();
  const list = Array.isArray(traits) ? traits : [];
  const sizeAt = list.findIndex(t => SIZES.has(squeeze(t)));
  const out = [];
  list.forEach((trait, index) => {
    const key = squeeze(trait), upper = String(trait).toUpperCase();
    if (ALIGNMENT_ABBR.has(upper) || (ALIGNMENT_SLOT.has(upper) && (sizeAt < 0 || index < sizeAt))) return log.add(`Tendência removida (${upper})`);
    if (ALIGNMENT_TRAITS.has(key)) return log.add(`Traço de tendência removido (${upper})`);
    if (SCHOOL_TRAITS.has(key)) return log.add(`Traço de escola removido (${upper})`);
    if (ENERGY_TRAITS[key]) {
      log.add(`Traço ${upper} → ${ENERGY_TRAITS[key]}`);
      if (!out.some(t => squeeze(t) === squeeze(ENERGY_TRAITS[key]))) out.push(ENERGY_TRAITS[key]);
      return;
    }
    if (!out.some(t => squeeze(t) === key)) out.push(trait);
  });
  for (const [key, holy] of HOLY_BY_TRAIT) {
    const source = out.find(t => squeeze(t) === key);
    if (source && insertTrait(out, holy)) log.add(`Traço ${holy} adicionado (${source.toUpperCase()})`);
  }
  return { traits: out, changes: log.list };
}

// ---------- texto: planos (mantidos) ----------
// Os planos de energia mudaram de nome no Remaster (Livro do Mestre): ficam como estão e só são anotados.
const PLANE = rx(`${B}planos?\\s*d[ae]\\s*energia\\s*(positiva|negativa)(?:\\s*(?:e|ou)\\s*(?:(?:o\\s*)?plano\\s*d[ae]\\s*)?(?:energia\\s*)?(positiva|negativa))?${E}`);
const PLANE_NOTE = {
  positiva: 'Plano de Energia Positiva mantido (no Remaster: Forja da Criação)',
  negativa: 'Plano de Energia Negativa mantido (no Remaster: o Vazio)',
};

// ---------- texto: imunidades, fraquezas, resistências, salvamentos, regeneração ----------
const SCHOOL_WORDS = 'abjura[çc][ãa]o|adivinha[çc][ãa]o|conjura[çc][ãa]o|encantamento|evoca[çc][ãa]o|necromancia|transmuta[çc][ãa]o';
const DEFENSE_SWAP = { positivo: 'vital', negativo: 'eversivo', bondoso: 'sagrado', maligno: 'profano' };
const DEFENSE_ITEM = rx(`${B}(positiv[oa]|negativ[oa]|bondos[oa]|malign[oa]|ca[óo]tic[oa]|ordeir[oa]|ceg[oa]s?|surd[oa]s?|lent[oa]s?|${SCHOOL_WORDS})${E}`);

// Troca os tipos legados de uma lista de defesas. kind: "imunidade", "fraqueza", "resistência", "salvamento", "regeneração".
// Caótico, ordeiro e escolas de magia não têm equivalente: ficam (protegidos das regras seguintes) e são anotados.
function adaptDefenseItems(segment, kind, log, safe) {
  return segment.replace(DEFENSE_ITEM, word => {
    const key = legacyKey(word);
    if (DEFENSE_SWAP[key]) {
      log.add(`${kind} ${key} → ${DEFENSE_SWAP[key]}`);
      return safe.keep(matchCase(word, DEFENSE_SWAP[key]));
    }
    if (key === 'caotico' || key === 'ordeiro') {
      log.add(`${kind} ${LABEL[key]}: sem equivalente no Remaster`);
      return safe.keep(word);
    }
    if (key) return safe.keep(swapCondition(word, log));
    log.add(`${kind} ${word.toLowerCase()}: escola sem equivalente no Remaster`);
    return safe.keep(word);
  });
}

// Linhas do bloco de estatísticas: "Imunidades …", "Fraquezas …", "Resistências …" até o ";" ou até uma linha que
// começa com maiúscula (as listas quebradas continuam na linha seguinte em minúsculas).
const DEFENSE_LIST = /(^|[;\n][ \t]*)(Imunidades|Fraquezas|Resist[êe]ncias)([\s\S]*?)(?=;|\n(?=\p{Lu})|$)/gu;
const DEFENSE_KIND = label => (/^Imun/.test(label) ? 'imunidade' : /^Fraq/.test(label) ? 'fraqueza' : 'resistência');

// No texto corrido: "resistência a positivo", "fraqueza 2 a dano bondoso", "imune a negativo", "salvamentos contra positivo".
// Sagrado e profano não são tipos de dano: "fraqueza a dano maligno" vira "fraqueza a profano" (como no Remaster).
const DAMAGE_TYPE_WORDS = 'positiv[oa]|negativ[oa]|bondos[oa]|malign[oa]|ca[óo]tic[oa]|ordeir[oa]|[áa]cido|eletricidade|fogo|frio|s[ôo]nico|for[çc]a|veneno|mental|f[íi]sico|cortante|perfurante|contundente|sangramento|precis[ãa]o|espiritual|sagrado|profano|vital|eversivo';
const DEFENSE_RUN_ITEM = `(?:dano\\s*(?:de\\s*)?)?(?:${DAMAGE_TYPE_WORDS})(?:\\s*\\d+)?`;
const DEFENSE_PROSE = rx(`${B}(resist[êe]ncias?|fraquezas?|imunidades?|imunes?|salvamentos?)((?:\\s*\\d+)?\\s*(?:a|à|ao|aos|contra)\\s*)(${DEFENSE_RUN_ITEM}(?:\\s*(?:,|e|ou)\\s*(?:a\\s*)?${DEFENSE_RUN_ITEM})*)${E}`);
const PROSE_KIND = word => (/^res/i.test(word) ? 'resistência' : /^fra/i.test(word) ? 'fraqueza' : /^imu/i.test(word) ? 'imunidade' : 'salvamento');
const PROSE_ITEM = rx(`(dano\\s*(?:de\\s*)?)?${B}(positiv[oa]|negativ[oa]|bondos[oa]|malign[oa]|ca[óo]tic[oa]|ordeir[oa])${E}`);
function adaptDefenseRun(run, kind, log, safe) {
  return run.replace(PROSE_ITEM, (all, dano = '', word) => {
    const key = legacyKey(word);
    if (key === 'bondoso' || key === 'maligno') {
      log.add(`${kind} ${key} → ${DEFENSE_SWAP[key]}`);
      return safe.keep(matchCase(word, DEFENSE_SWAP[key]));
    }
    if (key === 'positivo' || key === 'negativo') {
      log.add(`${kind} ${key} → ${DEFENSE_SWAP[key]}`);
      return dano + safe.keep(swapPolarity(word));
    }
    log.add(`${kind} ${LABEL[key]}: sem equivalente no Remaster`);
    return dano + safe.keep(word);
  });
}

// Golpes que "contam como bondoso e ferro frio" para fraquezas: "contam como sagrado e ferro frio".
const COUNTS_ITEM = 'ferro\\s+frio|prata|adamante|m[áa]gic[oa]s?|bondos[oa]|malign[oa]|ca[óo]tic[oa]|ordeir[oa]|positiv[oa]|negativ[oa]';
const COUNTS_AS = rx(`${B}(conta(?:m|r|ria|riam)?\\s+como\\s+)((?:${COUNTS_ITEM})(?:\\s*(?:,|e|ou)\\s*(?:${COUNTS_ITEM}))*)${E}`);

// Regeneração: "(desativada por bondoso ou prata)" → "(desativada por sagrado ou prata)".
const DEACTIVATED = rx(`${B}(desativad[ao]s?\\s*(?:por|pelo|pela)\\s*)([^();.\\n]*)`);

// ---------- texto: listas de traços entre parênteses ----------
// "(arcano, evocação, fogo)", "(ácido, alcance 4,5 metros, caótico, mágico, maligno; página 30)": saem escola e tendência,
// positivo/negativo viram vitalidade/eversão. Só listas com cara de traços (itens curtos, sem verbo nem preposição).
const PAREN = /( ?)\(([^()]{1,300})\)/gu;
const NOT_TRAIT_START = /^\s*(?:exceto|desativad|veja|ver\s|como|at[ée]\s|incluindo|p[áa]gina|p\.|ou\s|e\s|mas\s|se\s|quando|cerca|somente|apenas|à\s*vontade)/iu;
// Palavra de frase dentro do parêntese: não é lista de traços ("não-letal" é traço, por isso o hífen conta como letra).
const NOT_TRAIT_WORD = /(?<![\p{L}-])(?:por|que|se|como|veja|quando|exceto|para|pelo|pela|até|seu|sua|você|ele|ela|uma?)(?![\p{L}-])/iu;
const ENERGY_TRAIT_WORD = { positivo: 'vitalidade', negativo: 'eversão', positive: 'vitalidade', negative: 'eversão' };
function traitItems(head) {
  if (NOT_TRAIT_START.test(head)) return null;
  const items = head.split(/\s*,\s*(?!\d)/u).map(item => item.trim());
  if (items.some(item => !item || item.length > 40 || item.split(/\s+/).length > 5 || NOT_TRAIT_WORD.test(item) || !/^[\[\p{L}\p{N}]/u.test(item))) return null;
  return items;
}
function adaptTraitList(text, log) {
  return text.replace(PAREN, (all, space, content) => {
    const cut = content.indexOf(';');
    const head = cut < 0 ? content : content.slice(0, cut), tail = cut < 0 ? '' : content.slice(cut);
    const items = traitItems(head);
    if (!items) return all;
    let changed = false;
    const kept = [];
    for (const item of items) {
      const key = squeeze(item);
      if (ALIGNMENT_TRAITS.has(key)) { log.add(`Traço de tendência removido (${item.toUpperCase()})`); changed = true; continue; }
      if (SCHOOL_TRAITS.has(key)) { log.add(`Traço de escola removido (${item.toUpperCase()})`); changed = true; continue; }
      if (ENERGY_TRAIT_WORD[key]) {
        const target = matchCase(item, ENERGY_TRAIT_WORD[key]);
        log.add(`Traço ${item.toUpperCase()} → ${target.toUpperCase()}`);
        changed = true;
        kept.push(target);
        continue;
      }
      kept.push(item);
    }
    if (!changed) return all;
    if (!kept.length && !tail) return '';
    return `${space}(${kept.join(', ')}${kept.length ? tail : tail.replace(/^;\s*/, '')})`;
  });
}

// ---------- texto: energia, cura e dano ----------
const ENERGY = rx(`${B}(energias?\\s*)(positiv[oa]s?|negativ[oa]s?)((?:\\s*(?:,|e|ou)\\s*)(positiv[oa]s?|negativ[oa]s?))?${E}`);
// "cura negativa" → "cura eversiva"; a cura positiva dos Livros do Jogador é "cura de vitalidade" ("cura vital" não existe).
const CURE = rx(`${B}(cura\\s*)(negativa|positiva)${E}`);
const CURE_SWAP = { negativa: 'eversiva', positiva: 'de vitalidade' };
// "1d6 maligno", "Dano 2d8+5 negativo", "20d8 de dano negativo", "1d6 de dano persistente bondoso", "dano maligno",
// "5d8+18 positivo ou negativo". Sagrado/profano entram como anotação do dano espiritual, como no pedido.
const AMOUNT = '\\d+(?:d\\d+)?(?:\\s*[+−–-]\\s*\\d+)?';
const DAMAGE_WORD = 'positivo|negativo|bondoso|maligno|ca[óo]tico|ordeiro';
const DAMAGE = rx(`((?:(?<![\\p{L}\\p{N}])${AMOUNT}\\s*(?:de\\s*)?(?:dano\\s*)?|${B}danos?\\s*)(?:persistente\\s*)?(?:de\\s*)?)(${DAMAGE_WORD})((?:\\s*(?:,|e|ou)\\s*(?:${DAMAGE_WORD}))*)${E}`);
// Tipo legado no fim de uma lista de tipos: "dano de veneno, frio ou negativo", "dano de frio em vez de negativo".
const COMMON_DAMAGE = '[áa]cido|eletricidade|fogo|frio|s[ôo]nico|for[çc]a|veneno|mental|cortante|perfurante|contundente|sangramento';
const DAMAGE_LIST = rx(`(${B}danos?\\s*(?:de\\s*)?(?:${COMMON_DAMAGE})(?:\\s*(?:,|e|ou|em\\s+vez\\s+de)\\s*(?:${COMMON_DAMAGE}))*\\s*(?:,|e|ou|em\\s+vez\\s+de)\\s*)(${DAMAGE_WORD})${E}`);
const DAMAGE_SWAP = { positivo: 'vital', negativo: 'eversivo', bondoso: 'espiritual (sagrado)', maligno: 'espiritual (profano)', caotico: 'espiritual', ordeiro: 'espiritual' };
const DAMAGE_ONE = rx(`${B}(${DAMAGE_WORD})${E}`);

// ---------- texto: Golpe Reativo, ranque, atributo ----------
const REACTIVE = rx(`${B}ataque(s?)\\s*de\\s*oportunidade${E}`);
const SPELL_LEVEL_WORD = rx(`${B}(n[íi]ve(?:l|is))(\\s*d[aeo]s?\\s*(?:magias?|truques?)${E})`);
const COUNTERACT_LEVEL = rx(`${B}(n[íi]ve(?:l|is))(\\s*de\\s*neutraliza[çc][ãa]o${E})`);
// "de 3º nível" só vira ranque quando a oração fala de magia logo antes ("magia arcana de 2º nível", "espaço de magia de
// 3º nível", "magias inatas de 5º nível", "elevada ao 4º nível", "conjura … (4º nível)") e nada de criatura, personagem,
// item, CD etc. aparece entre a palavra de magia e o nível. Só "nível" minúsculo: "2º NÍVEL" é título de talentos de classe.
// "no 5º nível"/"do 5º nível" é nível de personagem ("magias de 1º ranque, e no 5º nível…"), e vírgula separa orações
// (menos entre ordinais: "magias de 1º, 3º ou 5º nível").
const ORDINAL_LEVEL = /(?<![\p{L}\p{N}])(\d{1,2}\s*[ºo°]\s*)(n[íi]vel)(?!\p{L})/gu;
const SPELL_TRIGGER = /(?<!\p{L})(?:magias?|truques?|espaços?|rituais|ritual|inatas?|elevad[ao]s?|conjur(?:a|am|ar|e|em|ou|ada|ado|adas|ados))(?!\p{L})/giu;
const SPELL_BLOCKER = /(?<!\p{L})(?:criaturas?|personage(?:m|ns)|PdJs?|PJs?|ite(?:m|ns)|alvos?|você|aliados?|inimigos?|oponentes?|classes?|talentos?|armas?|armaduras?|escudos?|runas?|cajados?|varinhas?|pergaminhos?|poç(?:ão|ões)|talism(?:ã|ãs)|companheiros?|familiar(?:es)?|monstros?|conjurador(?:es)?|níveis|nível|ancestralidades?|perigos?|armadilhas?|habilidades?|CDs?)(?!\p{L})/iu;
// Lista de magias: "conjure curar de 8º nível e sopro de vida de 8º nível" — o ranque recém-trocado puxa o item seguinte.
const RANK_CHAIN = /\d{1,2}\s*[ºo°]\s*ranque(?=\s*(?:,|e|ou)\s)/gu;
function spellRankContext(before) {
  if (/(?<!\p{L})(?:no|do)\s*$/iu.test(before)) return false;
  const clause = before.split(/[.;:!?]|\n(?=\p{Lu})/u).pop();
  const triggers = [...clause.matchAll(SPELL_TRIGGER), ...clause.matchAll(RANK_CHAIN)].sort((a, b) => a.index - b.index);
  if (!triggers.length) return false;
  const last = triggers[triggers.length - 1];
  const gap = clause.slice(last.index + last[0].length);
  const chained = /ranque$/u.test(last[0]);
  return gap.trim().split(/\s+/).filter(Boolean).length <= 6 && !SPELL_BLOCKER.test(gap) && (chained || !/,(?!\s*\d{1,2}\s*[ºo°])/u.test(gap));
}
const ABILITY_MODIFIER = rx(`${B}(modificador(?:es)?\\s*de\\s*)(habilidade)${E}`);

// ---------- texto: condições ----------
// Nos bestiários a condição "desacelerado" é "lento N", "cegado" é "cego" e "ensurdecido" é "surdo" (os Livros do Jogador
// usam os nomes do apêndice de condições). Só com contexto de condição: valor numérico, "fica…", "condição…",
// "por 1 rodada"/"até o final"; "ponto cego" ou "obediência cega" ficam.
// Valor de condição é número pequeno: "Lenta 1.500" (tabela de XP) não é a condição.
const SLOWED = rx(`${B}(lent)([oa]s?)(\\s*)(?=\\d{1,2}(?![\\d.,]\\d))`);
const FICAR = '(?:fica|ficam|ficar|ficará|ficarão|fique|fiquem|ficou|ficaram|ficando|ficaria|ficariam|está|estão|estiver|estiverem|esteja|estejam)';
const ADVERB = '(?:\\s+(?:permanentemente|também|temporariamente|imediatamente|ainda))?';
const SENSE = '(?:ceg|surd)[oa]s?';
// Nomes de condição do Remaster (apêndice do Livro do Jogador 1), para reconhecer listas: "confuso e cego", "cega ou ofuscada".
const CONDITION = '(?:acelerad|agarrad|assustad|atordoad|cegad|condenad|confus|controlad|desacelerad|desajeitad|desprevenid|drenad|enfraquecid|enjoad|ensurdecid|estupefat|fascinad|fatigad|ferid|imobilizad|ofuscad|paralisad|petrificad|prostrad|restringid|sobrecarregad)[oa]s?|inconscientes?|fugindo';
const COND_AFTER_VERB = rx(`${B}(${FICAR}${ADVERB}\\s+)(${SENSE})${E}`);
// "a condição surdo", "as seguintes condições: assustado, atordoado, cego, … ou surdo".
const COND_NAME_LIST = rx(`${B}(condi[çc](?:[ãa]o|[õo]es)\\s*:?\\s*)((?:\\p{L}+(?:\\s+\\d+)?(?:\\s*,\\s*|\\s+(?:ou|e)\\s+))*\\p{L}+)`);
const COND_IN_LIST = rx(`${B}(${SENSE}|lent[oa]s?)${E}`);
// Duração logo depois: "cego por 1 rodada", "cega até o final", "cego (1 dia)" — "(4º)" depois de nome de talento não conta.
const COND_BEFORE_SPAN = rx(`${B}(${SENSE})(?=\\s+(?:por\\s+(?:\\d|uma?\\s|1d)|até\\s+(?:o|a|que|ser)\\s|permanentemente)|\\s*\\((?:\\d+|1d\\d+)\\s*(?:rodadas?|minutos?|horas?|dias?)\\))`);
const COND_CHAIN = rx(`(${B}(?:${CONDITION})(?:\\s+\\d+)?\\s*(?:,|e|ou)\\s*)(${SENSE})${E}`);
const COND_CHAIN_BACK = rx(`${B}(${SENSE})(?=\\s*(?:,|e|ou)\\s*(?:${CONDITION})${E})`);
const CONDITION_SWAP = { ceg: ['cego', 'cegad'], surd: ['surdo', 'ensurdecid'], lent: ['lento', 'desacelerad'] };
// "cega" → "cegada", "Surdos" → "Ensurdecidos", "lento" → "desacelerado" (gênero e número do original).
function swapCondition(word, log) {
  const [, stem, ending] = word.match(/^(ceg|surd|lent)(.*)$/iu);
  const [name, target] = CONDITION_SWAP[stem.toLowerCase()];
  log.add(`condição ${name} → ${target}o`);
  return matchCase(word, target + ending.toLowerCase());
}

// ---------- texto: ativação de itens e componentes de magia ----------
// Ativação: comando e visualizar viram o traço concentração; Interagir vira manuseio ("Ativação [one-action] (manuseio)").
// O glifo vem como no livro ("[one-action]") ou já traduzido pelo catálogo de itens ("(1 ação)"); os componentes vêm soltos
// ("comando, Interagir") ou entre parênteses ("(Interagir)"), às vezes seguidos de uma lista de traços, que é juntada.
const GLYPH = '(?:\\[(?:one-action|two-actions|three-actions|free-action|reaction)\\]|\\((?:1 ação|2 ações|3 ações|reação|ação livre)\\))';
const ACTIVATION_WORD = 'comando|comandar|visualizar|interagir|concentração|manuseio';
const ACTIVATION_LIST = `(?:${ACTIVATION_WORD})(?:\\s*(?:,|e)\\s*(?:${ACTIVATION_WORD}))*`;
const ACTIVATION_TRAIT = { comando: 'concentração', comandar: 'concentração', visualizar: 'concentração', interagir: 'manuseio' };
const activationPatterns = prefix => ({
  plain: rx(`${prefix}((?:${GLYPH}\\s*(?:(?:a|até)\\s*${GLYPH}\\s*)?)?)(\\(\\s*${ACTIVATION_LIST}\\s*\\)|${ACTIVATION_LIST})${E}(\\s*\\(([^()]*)\\))?`),
  timed: rx(`${prefix}(\\d+\\s*(?:minutos?|horas?|dias?|rodadas?)\\s*)\\((${ACTIVATION_LIST})((?:\\s*,\\s*[^()]*)?)\\)`),
});
const ACTIVATION_IN_TEXT = activationPatterns(`${B}(ativa[çc][ãa]o\\s*)`);
const ACTIVATION_FIELD = activationPatterns('^(\\s*)');
const hasLegacyActivation = components => /(?<!\p{L})(?:comando|comandar|visualizar|interagir)(?!\p{L})/iu.test(components);
function activationTraits(components, extra, log) {
  const traits = [];
  for (const word of components.replace(/[()]/g, '').split(/\s*(?:,|\be\b)\s*/u).map(w => w.trim()).filter(Boolean)) {
    const legacy = ACTIVATION_TRAIT[word.toLowerCase()];
    if (legacy) log.add(`ativação ${word.toLowerCase() === 'interagir' ? 'Interagir' : word.toLowerCase()} → ${legacy}`);
    const trait = legacy || word.toLowerCase();
    if (!traits.includes(trait)) traits.push(trait);
  }
  const more = extra ? traitItems(extra) : [];
  for (const item of more || []) if (!traits.some(t => squeeze(t) === squeeze(item))) traits.push(item);
  return traits.sort(collate);
}
function adaptActivation(text, patterns, log) {
  return text
    .replace(patterns.plain, (all, prefix, glyphs, components, paren = '', inside) => {
      if (!hasLegacyActivation(components)) return all;
      const merge = inside !== undefined && traitItems(inside);
      const traits = activationTraits(components, merge ? inside : '', log);
      return `${prefix}${glyphs}(${traits.join(', ')})${merge ? '' : paren}`;
    })
    .replace(patterns.timed, (all, prefix, time, components, rest) => {
      if (!hasLegacyActivation(components)) return all;
      const traits = activationTraits(components, rest.replace(/^\s*,\s*/, ''), log);
      return `${prefix}${time}(${traits.join(', ')})`;
    });
}

// Componentes de magia: verbal vira o traço CONCENTRAÇÃO; material, somático e foco viram MANUSEIO.
// "[two-actions] somático, verbal" → "[two-actions]"; "1 minuto (material, somático, verbal)" → "1 minuto".
const COMPONENT_WORD = 'materiais|material|som[áa]tic[oa]s?|verbais|verbal|foco';
const COMPONENT_LIST = `(?:${COMPONENT_WORD})(?:\\s*(?:,|e)\\s*(?:${COMPONENT_WORD}))*`;
const CAST_ACTIONS = new RegExp(`^(\\s*(?:${GLYPH}\\s*(?:(?:a|até)\\s*${GLYPH}\\s*)?)?)(${COMPONENT_LIST})(?!\\p{L})\\s*(?=;|$)`, 'iu');
const CAST_TIMED = new RegExp(`^(\\s*\\S.*?)\\s*\\((${COMPONENT_LIST})\\)\\s*(?=;|$)`, 'iu');
const CAST_LINE = /^((?:Execu[çc][ãa]o|Conjura[çc][ãa]o)\s*)(.*)$/gmu;
function componentTraits(list, log) {
  const traits = [];
  for (const word of list.split(/\s*(?:,|\be\b)\s*/u).map(w => w.trim().toLowerCase()).filter(Boolean)) {
    const name = /^verba/.test(word) ? 'verbal' : /^som/.test(word) ? 'somático' : /^mat/.test(word) ? 'material' : 'foco';
    const trait = name === 'verbal' ? 'CONCENTRAÇÃO' : 'MANUSEIO';
    log.add(`componente ${name} → ${trait}`);
    if (!traits.includes(trait)) traits.push(trait);
  }
  return traits;
}
function adaptCast(text, log) {
  let traits = [];
  const out = text
    .replace(CAST_ACTIONS, (all, glyphs, list) => { traits = componentTraits(list, log); return glyphs.trimEnd(); })
    .replace(CAST_TIMED, (all, time, list) => { traits = [...new Set([...traits, ...componentTraits(list, log)])]; return time; });
  return { text: out, traits };
}

// ---------- texto: só anotações ----------
const WISH = rx(`${B}(?:magias?\\s+(?:d[eao]\\s+)?desejo|\\d+\\s*[ºo°]\\s*desejo|desejo\\s+ou\\s+(?:uma\\s+)?magia|como\\s+um\\s+desejo)${E}`, 'iu');
// Quadro "Regras atualizadas": os idiomas dos planos elementais mudaram de nome.
const LANGUAGES = { Aquan: 'Talássico', Auran: 'Sussurrano', Ignan: 'Pírico', Terran: 'Petrano' };
const LANGUAGE = new RegExp(`(?<!\\p{L})(${Object.keys(LANGUAGES).join('|')})(?!\\p{L})`, 'gu');
const MEPHIT = rx(`${B}mephit`, 'iu'); // sem fim de palavra: nomes vêm colados ("MEPHITDATERRA")

// ---------- adaptarTexto ----------
// options.components: a entrada é magia (pode receber os traços dos componentes); o resultado traz `traits` a acrescentar.
export function adaptarTexto(text, options = {}) {
  if (typeof text !== 'string' || !text) return { text, changes: [], traits: [] };
  const log = collector();
  const safe = vault();
  const traits = [];
  let out = text;

  out = out.replace(PLANE, (all, first, second) => {
    for (const adjective of [first, second].filter(Boolean)) log.add(PLANE_NOTE[adjective.toLowerCase()]);
    return safe.keep(all);
  });
  out = out.replace(DEFENSE_LIST, (all, start, label, segment) => start + label + adaptDefenseItems(segment, DEFENSE_KIND(label), log, safe));
  out = out.replace(DEACTIVATED, (all, lead, segment) => lead + adaptDefenseItems(segment, 'regeneração', log, safe));
  out = out.replace(DEFENSE_PROSE, (all, word, link, run) => word + link + adaptDefenseRun(run, PROSE_KIND(word), log, safe));
  out = out.replace(COUNTS_AS, (all, lead, run) => lead + adaptDefenseRun(run, 'conta como', log, safe));
  out = adaptTraitList(out, log);
  out = out.replace(ENERGY, (all, lead, first, more = '', second) => {
    log.add(`energia ${/^p/i.test(first) ? 'positiva → vital' : 'negativa → eversiva'}`);
    if (second) log.add(`energia ${/^p/i.test(second) ? 'positiva → vital' : 'negativa → eversiva'}`);
    return lead + swapPolarity(first) + (second ? more.slice(0, more.length - second.length) + swapPolarity(second) : '');
  });
  out = out.replace(CURE, (all, lead, word) => {
    const target = CURE_SWAP[word.toLowerCase()];
    log.add(`cura ${word.toLowerCase()} → ${target}`);
    return lead + matchCase(word, target);
  });
  const swapDamage = word => {
    const key = legacyKey(word);
    log.add(`dano ${LABEL[key]} → ${DAMAGE_SWAP[key]}`);
    return matchCase(word, DAMAGE_SWAP[key]);
  };
  out = out.replace(DAMAGE, (all, lead, first, more) => lead + (first + more).replace(DAMAGE_ONE, swapDamage));
  out = out.replace(DAMAGE_LIST, (all, lead, word) => lead + swapDamage(word));
  out = out.replace(REACTIVE, (all, plural) => { log.add('Ataque de Oportunidade → Golpe Reativo'); return matchCase(all, plural ? 'golpes reativos' : 'golpe reativo'); });
  out = out.replace(SPELL_LEVEL_WORD, (all, word, rest) => { log.add('nível de magia → ranque'); return matchCase(word, /is$/i.test(word) ? 'ranques' : 'ranque') + rest; });
  out = out.replace(COUNTERACT_LEVEL, (all, word, rest) => { log.add('nível de neutralização → ranque de neutralização'); return matchCase(word, /is$/i.test(word) ? 'ranques' : 'ranque') + rest; });
  // Repete enquanto houver troca: cada ranque trocado pode puxar o próximo item de uma lista de magias.
  for (let previous = ''; previous !== out;) {
    previous = out;
    out = out.replace(ORDINAL_LEVEL, (all, number, word, offset, whole) => {
      if (!spellRankContext(whole.slice(Math.max(0, offset - 90), offset))) return all;
      log.add('nível de magia → ranque');
      return number + 'ranque';
    });
  }
  out = out.replace(ABILITY_MODIFIER, (all, lead, word) => { log.add('modificador de habilidade → atributo'); return lead + matchCase(word, 'atributo'); });
  out = out.replace(SLOWED, (all, stem, ending, space) => swapCondition(stem + ending, log) + (space || ' '));
  out = out.replace(COND_AFTER_VERB, (all, lead, word) => lead + swapCondition(word, log));
  out = out.replace(COND_NAME_LIST, (all, lead, list) => lead + list.replace(COND_IN_LIST, word => swapCondition(word, log)));
  out = out.replace(COND_BEFORE_SPAN, word => swapCondition(word, log));
  for (let previous = ''; previous !== out;) {
    previous = out;
    out = out.replace(COND_CHAIN, (all, lead, word) => lead + swapCondition(word, log));
    out = out.replace(COND_CHAIN_BACK, word => swapCondition(word, log));
  }
  out = adaptActivation(out, ACTIVATION_IN_TEXT, log);
  out = out.replace(CAST_LINE, (all, label, rest) => {
    if (!CAST_ACTIONS.test(rest) && !CAST_TIMED.test(rest)) return all;
    if (!options.components) { log.add('componentes de magia mantidos no texto'); return all; }
    const cast = adaptCast(rest, log);
    traits.push(...cast.traits.filter(t => !traits.includes(t)));
    return (label + cast.text).trimEnd();
  });
  if (WISH.test(out)) log.add('Desejo agora é ritual (texto mantido)');
  for (const [, language] of out.matchAll(LANGUAGE)) log.add(`Idioma ${language}: ${LANGUAGES[language]} no Remaster (texto mantido)`);
  if (MEPHIT.test(out)) log.add('Mephits viraram trastes elementais no Remaster (texto mantido)');

  return { text: safe.restore(out), changes: log.list, traits };
}

// Campo de ativação de item ("[one-action] Interagir", "comando, visualizar"): componentes viram traços entre parênteses.
export function adaptarAtivacao(text) {
  if (typeof text !== 'string' || !text) return { text, changes: [] };
  const log = collector();
  const first = adaptActivation(text, ACTIVATION_FIELD, log);
  const rest = adaptarTexto(first);
  return { text: rest.text, changes: [...new Set([...log.list, ...rest.changes])] };
}

// Campo de execução de magia ("[two-actions] somático, verbal"): devolve o texto sem os componentes e os traços a acrescentar.
export function adaptarExecucao(text) {
  if (typeof text !== 'string' || !text) return { text, changes: [], traits: [] };
  const log = collector();
  const cast = adaptCast(text, log);
  const rest = adaptarTexto(cast.text);
  return { text: rest.text, traits: cast.traits, changes: [...new Set([...log.list, ...rest.changes])] };
}

// ---------- adaptarRemaster ----------
const SPELL_TYPES = new Set(['spell', 'focus', 'ritual']);
const CAST_KEYS = ['time', 'cast'];
const ACTIVATION_KEYS = ['activate'];
// Campos que não são texto de regra (identidade, números, categoria derivada, glifo de ação).
const SKIP_KEYS = new Set(['name', 'book', 'page', 'level', 'type', 'id', 'actions', 'category', 'nameFixed', 'legacy', 'remaster',
  'price', 'bulk', 'hands', 'group', 'damage', 'damageType', 'reload', 'acBonus', 'dexCap', 'checkPenalty', 'speedPenalty', 'strength', 'hpPerLevel', 'keyAttribute']);
// Listas de objetos com texto de regra: só estas chaves de cada item mudam (nome, nível e preço de um tipo não).
const NESTED_TEXT = { heightened: ['text'], variants: ['text'], progression: ['features'], heritages: ['text'] };

export function adaptarRemaster(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const log = collector();
  const extraTraits = [];
  const spell = SPELL_TYPES.has(entry.type);
  const take = result => { result.changes.forEach(log.add); if (result.traits) extraTraits.push(...result.traits); return result.text; };

  if (Array.isArray(entry.traits)) {
    const result = adaptarTracos(entry.traits);
    entry.traits = result.traits;
    result.changes.forEach(log.add);
  }
  for (const key of CAST_KEYS) {
    if (typeof entry[key] !== 'string') continue;
    entry[key] = spell ? take(adaptarExecucao(entry[key])) : take(adaptarTexto(entry[key]));
  }
  for (const key of ACTIVATION_KEYS) if (typeof entry[key] === 'string') entry[key] = take(adaptarAtivacao(entry[key]));
  const textKeys = Object.keys(entry).filter(key => typeof entry[key] === 'string' && !SKIP_KEYS.has(key) && !CAST_KEYS.includes(key) && !ACTIVATION_KEYS.includes(key));
  textKeys.sort((a, b) => (a === 'text' ? -1 : b === 'text' ? 1 : 0));
  for (const key of textKeys) entry[key] = take(adaptarTexto(entry[key], { components: spell }));
  for (const [key, fields] of Object.entries(NESTED_TEXT)) {
    if (!Array.isArray(entry[key])) continue;
    for (const item of entry[key]) {
      if (!item || typeof item !== 'object') continue;
      for (const field of fields) if (typeof item[field] === 'string') item[field] = take(adaptarTexto(item[field], { components: spell }));
    }
  }
  if (extraTraits.length) {
    if (!Array.isArray(entry.traits)) entry.traits = [];
    for (const trait of extraTraits) insertTrait(entry.traits, trait);
  }
  if (typeof entry.name === 'string' && MEPHIT.test(entry.name)) log.add('Mephits viraram trastes elementais no Remaster (texto mantido)');

  entry.legacy = true;
  entry.remaster = [...new Set([...(Array.isArray(entry.remaster) ? entry.remaster : []), ...log.list])];
  return entry;
}
