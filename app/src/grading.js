// The grading contract uses exact strings. In particular, formatting validity
// is decided before computing a comparison value for numerical responses.
export function templateItems(profile) {
  return profile.components.flatMap(({ items }) => items.map(({ id, kind, choices, slots }) => ({
    id, kind, ...(kind === 'mc' ? { choices: choices.map(({ symbol }) => symbol) }
      : { slots: slots.map(({ choices: options }) => options.map(({ symbol }) => symbol)) }),
  })));
}

export function templateSnapshot(profile) {
  const { id, revision, name } = profile;
  return { id, revision, name, items: templateItems(profile) };
}

export function sameTemplate(a, b) {
  return Boolean(a && b && a.id === b.id && a.revision === b.revision &&
    JSON.stringify(a.items) === JSON.stringify(b.items));
}

export function normalizeAnswer(item, value) {
  if (value === null || value === '' || value === '    ') return { status: 'blank', value: null };
  if (typeof value !== 'string') return { status: 'invalid', reason: 'Invalid answer.' };
  if (item.kind === 'mc') return item.choices.includes(value)
    ? { status: 'valid', value } : { status: 'invalid', reason: 'Choice is outside the profile.' };
  if (value.length > 4 || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)? *$/.test(value)) {
    return { status: 'invalid', reason: 'Use left-aligned digits, trailing blanks only, and no unnecessary leading zeros.' };
  }
  const text = value.trimEnd();
  if ([...text].some((symbol, index) => !item.slots[index]?.includes(symbol))) {
    return { status: 'invalid', reason: 'A digit or decimal is outside the configured slot.' };
  }
  const [whole, fraction = ''] = text.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return { status: 'valid', value: trimmed ? whole + '.' + trimmed : whole };
}

export function validateKey(template, answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Invalid answer key.');
  const items = new Map(template.items.map((item) => [item.id, item]));
  for (const [id, answer] of Object.entries(answers)) {
    const item = items.get(id);
    if (!item || normalizeAnswer(item, answer).status !== 'valid') throw new Error(`Invalid key for ${id}.`);
  }
  return { ...answers };
}

export function gradeScan(scan, key) {
  if (key && !sameTemplate(scan.template, key.template)) throw new Error('Key and template revisions do not match.');
  const observations = new Map(scan.observation.items.map((item) => [item.id, item]));
  const decisions = new Map();
  for (const event of scan.history) {
    const state = decisions.get(event.itemId) ?? [];
    if (event.kind === 'undo') state.pop();
    else state.push(event);
    decisions.set(event.itemId, state);
  }
  const tally = { score: 0, denominator: 0, pending: 0, status: 'final', items: [] };
  for (const item of scan.template.items) {
    const raw = observations.get(item.id);
    const keyed = Boolean(key && Object.hasOwn(key.answers, item.id));
    const events = decisions.get(item.id) ?? [];
    const correction = events.findLast(({ kind }) => kind === 'correct');
    const override = events.at(-1);
    const effective = correction ? correction.value : raw?.rawText;
    const parsed = normalizeAnswer(item, effective);
    const needsReview = !correction && (!raw || raw.review || !['single', 'blank'].includes(raw.status)) ||
      parsed.status === 'invalid';
    const adjudicated = override?.kind === 'award' || override?.kind === 'deny';
    const pending = needsReview && !adjudicated;
    const points = !keyed || pending ? 0 : adjudicated ? Number(override.kind === 'award')
      : Number(parsed.status === 'valid' && parsed.value === normalizeAnswer(item, key.answers[item.id]).value);
    const status = !keyed ? 'unkeyed' : pending ? 'pending' : points ? 'correct' : 'incorrect';
    tally.score += points;
    tally.denominator += Number(keyed);
    tally.pending += Number(pending);
    tally.items.push({ id: item.id, raw: raw?.rawText ?? null, effective: effective ?? null, status, keyed,
      pending, points, adjudication: adjudicated ? override.kind : null,
      reason: parsed.reason ?? raw?.reasons?.join(', ') ?? '' });
  }
  if (tally.pending) tally.status = 'provisional';
  return tally;
}

export function addDecision(scan, itemId, kind, value) {
  const item = scan.template.items.find(({ id }) => itemId === id);
  if (!item || !['correct', 'award', 'deny', 'undo'].includes(kind)) throw new Error('Invalid review action.');
  if (kind === 'correct' && normalizeAnswer(item, value).status === 'invalid') {
    throw new Error(normalizeAnswer(item, value).reason);
  }
  const event = { itemId, kind, ...(kind === 'correct' ? { value } : {}), at: new Date().toISOString() };
  return { ...scan, history: [...scan.history, event] };
}
