const states = {
  blank: 'No completed mark detected', single: 'Completed mark detected', incomplete: 'Incomplete mark',
  competing: 'Competing marks', uncertain: 'Uncertain optical evidence',
  unobservable: 'Some bubbles could not be read', 'low-confidence': 'Confidence below the preview threshold',
  'no-reference': 'Matching blank needed for the completion check',
};

function add(parent, tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  parent.append(element);
  return element;
}

function establishedText(item) {
  if (!item) return 'Unavailable';
  if (item.status === 'blank') return 'Blank';
  if (item.rawText?.trim()) return item.rawText.trim() + (item.review ? ' (review)' : '');
  return item.status === 'multiple' ? 'Multiple marks (review)' : 'Needs review';
}

function opticalText(item) {
  return item.symbol || item.rawText?.trim() ||
    (item.optical === 'blank' || item.rawText === '    ' ? 'Blank' : 'Unresolved');
}

function issues(item, baseline) {
  const labels = new Set();
  if (opticalText(item) !== 'Unresolved' && opticalText(item) !== baseline?.rawText?.trim() &&
      !(opticalText(item) === 'Blank' && baseline?.status === 'blank')) labels.add('Engines differ');
  if (item.methods) {
    const spatial = item.disposition === 'would-accept';
    const agreement = item.methods.agreement.status === 'would-accept';
    const stacking = item.methods.stacking.status === 'would-accept';
    if (spatial !== agreement || (item.methods.stacking.status !== 'unavailable' && spatial !== stacking)) {
      labels.add('Experimental decisions differ');
    }
  }
  if (item.kind === 'mc' && item.reason && item.reason !== 'no-reference') labels.add(states[item.reason] ?? states.uncertain);
  if (item.kind === 'nr') {
    for (const slot of item.slots) {
      if (['incomplete', 'competing', 'uncertain'].includes(slot.optical)) labels.add(states[slot.optical]);
      if (slot.multimodal === 'disagreement') labels.add('Handwriting and bubbles differ');
    }
    if (item.reasons.includes('nr-format')) labels.add('Number format needs review');
  }
  return [...labels];
}

function detail(parent, item) {
  for (const [index, slot] of (item.slots ?? [item]).entries()) {
    if (item.slots) {
      const text = slot.handwriting?.confident ? ` · Handwriting ${slot.handwriting.symbol}` : '';
      add(parent, 'p', `Position ${index + 1} · ${opticalText(slot)} · ${states[slot.optical]}${text}`);
      if (slot.multimodal === 'disagreement') add(parent, 'p', 'Compare the handwriting and bubbles on the sheet.');
      if (slot.geometry?.observableBubbles < slot.bubbles.length) {
        add(parent, 'p', `Readable outlines ${slot.geometry.observableBubbles} of ${slot.bubbles.length}`);
      }
    }
    if (slot.confidence !== null) add(parent, 'p', `Optical confidence ${Math.round(slot.confidence * 100)}%`);
    const marks = slot.bubbles.filter(b => b.completion === 'incomplete' || b.completion === 'complete');
    if (marks.length) add(parent, 'p', marks.map(b => `${b.symbol} ${b.completion}`).join(' · '));
  }
}

export function showComparison(container, cpas, established, all) {
  container.replaceChildren();
  if (cpas?.status !== 'evaluated') return;
  const baseline = new Map(established.map(item => [item.id, item]));
  let shown = 0;
  for (const item of cpas.items) {
    const prior = baseline.get(item.id);
    const labels = issues(item, prior);
    if (!all && !labels.length) continue;
    shown++;
    const disclosure = add(container, 'details', '');
    disclosure.className = 'cpas-item';
    add(disclosure, 'summary', `${item.id} · ${labels.join(' · ') || 'No difference flagged'}`);
    add(disclosure, 'p', `Established ${establishedText(prior)} · CPAS optical ${opticalText(item)}`);
    add(disclosure, 'p', item.kind === 'nr' ? 'Experimental numerical response' :
      item.disposition === 'would-accept' ? 'Passes the experimental optical check' : 'CPAS suggests inspection');
    if (item.methods) {
      for (const [key, name] of [['agreement', 'Optical agreement'], ['stacking', 'Logistic stacking']]) {
        const decision = item.methods[key];
        const label = decision.status === 'would-accept' ? `Would accept ${decision.symbol ?? 'blank'}` :
          decision.status === 'unavailable' ? 'Unavailable' : 'Review';
        add(disclosure, 'p', `${name} · ${label}`);
      }
    }
    detail(disclosure, item);
  }
  if (!shown) add(container, 'p', 'No differences or inspection suggestions on this scan.');
}
