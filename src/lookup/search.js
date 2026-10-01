// search.js — ranked exam lookup. Pure functions, no React, no Firebase, so it
// can be unit-tested with `node --test`.
//
// Ranking (higher wins): exam name, then alias (protocol matching wording),
// then orderable (transcription name). A query matches a field when every word
// typed appears in that one field (a word may be the start of a longer word,
// so "extrem" finds "extremity").
//
// Protocol safety rule: a special protocol (kind 'protocol') is only found when
// the query contains at least one word that belongs to the protocol and NOT to
// its parent exam. So "CT lower extremity" or "CT knee" never surface MAKO, but
// "MAKO" does. Protocol orderables are never searched.

const STOP_WORDS = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'with', 'for']);

export const tokenize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/\bw\/o\b/g, 'wo') // "w/o" (without) is written "WO" on orders
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP_WORDS.has(t));

const wordMatches = (queryWord, fieldWord) => fieldWord.startsWith(queryWord);

const fieldMatches = (queryWords, fieldText) => {
  const fieldWords = tokenize(fieldText);
  return queryWords.every((q) => fieldWords.some((w) => wordMatches(q, w)));
};

const SCORE = {
  nameExact: 100,
  nameStart: 90,
  name: 80,
  aliasExact: 70,
  alias: 60,
  orderable: 40,
};

const scoreName = (queryWords, name) => {
  const norm = tokenize(name).join(' ');
  const q = queryWords.join(' ');
  if (norm === q) return SCORE.nameExact;
  if (norm.startsWith(q)) return SCORE.nameStart;
  if (fieldMatches(queryWords, name)) return SCORE.name;
  return 0;
};

const scoreAlias = (queryWords, alias) => {
  if (tokenize(alias).join(' ') === queryWords.join(' ')) return SCORE.aliasExact;
  if (fieldMatches(queryWords, alias)) return SCORE.alias;
  return 0;
};

// Words that identify a protocol apart from its parent exam.
const parentWords = (parent) =>
  parent
    ? [parent.name, ...parent.aliases, ...parent.orderables].flatMap(tokenize)
    : [];

const hasDistinctiveWord = (queryWords, exam, byId) => {
  const parentVocab = parentWords(byId.get(exam.parentId));
  const ownVocab = [exam.name, ...exam.aliases].flatMap(tokenize);
  return queryWords.some(
    (q) =>
      ownVocab.some((w) => wordMatches(q, w)) &&
      !parentVocab.some((w) => wordMatches(q, w)),
  );
};

// Best match for one exam, or null.
export const matchExam = (exam, queryWords, byId) => {
  const isProtocol = exam.kind === 'protocol';
  if (isProtocol && !hasDistinctiveWord(queryWords, exam, byId)) return null;

  let best = null;
  const consider = (score, matchedOn, matchedText) => {
    if (score > 0 && (!best || score > best.score)) best = { score, matchedOn, matchedText };
  };

  consider(scoreName(queryWords, exam.name), 'name', exam.name);
  for (const alias of exam.aliases) consider(scoreAlias(queryWords, alias), 'alias', alias);
  if (!isProtocol) {
    for (const o of exam.orderables) {
      if (fieldMatches(queryWords, o)) consider(SCORE.orderable, 'orderable', o);
    }
  }
  return best;
};

export const availabilityAt = (exam, facilityId) =>
  exam.facilities.find((f) => f.facilityId === facilityId) || {
    facilityId,
    availability: 'unknown',
    note: '',
  };

const isOffered = (exam, facilityId) =>
  ['yes', 'limited'].includes(availabilityAt(exam, facilityId).availability);

// Returns { results, notOfferedAtFacility }.
//   results: [{ exam, score, matchedOn, matchedText }], best first
//   notOfferedAtFacility: matches hidden by the facility filter
export const searchExams = (exams, { query = '', facilityId = '', category = '' } = {}) => {
  const byId = new Map(exams.map((e) => [e.id, e]));
  const queryWords = tokenize(query);

  let matches;
  if (queryWords.length === 0) {
    matches = exams.map((exam) => ({ exam, score: 0, matchedOn: null, matchedText: null }));
  } else {
    matches = [];
    for (const exam of exams) {
      const m = matchExam(exam, queryWords, byId);
      if (m) matches.push({ exam, ...m });
    }
  }

  if (category) matches = matches.filter((m) => m.exam.category === category);

  let notOfferedAtFacility = [];
  if (facilityId) {
    notOfferedAtFacility = matches.filter((m) => !isOffered(m.exam, facilityId));
    matches = matches.filter((m) => isOffered(m.exam, facilityId));
  }

  const byRank = (a, b) => b.score - a.score || a.exam.name.localeCompare(b.exam.name);
  return {
    results: matches.sort(byRank),
    notOfferedAtFacility: notOfferedAtFacility.sort(byRank),
  };
};

// Special protocols that live under this exam (shown on the parent's page so
// supervisors know a separate set of rules exists).
export const protocolsFor = (exams, examId) =>
  exams.filter((e) => e.kind === 'protocol' && e.parentId === examId);
