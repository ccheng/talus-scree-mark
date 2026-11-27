import { pageTransform } from '../markerless-registration.js';
import { toGrayImage } from '../omr-image.js';
import { createMarkerlessProfile } from '../profile-authoring.js';
import { readProfileSheet } from '../profile-omr.js';
import { compareMcPrint, enrollMcPrint, validMcPrint } from './mc-same-print.js';
import { classifyScopeEvidence, corroboratedExcludedRows, observeScopeRows, validateExcludedRows } from './scope-shadow.js';

const format = 'talus-localized-registration-shadow';
const version = 1;
const binding = profile => JSON.stringify([profile.id, profile.revision, profile.page, profile.components,
  profile.scope, profile.mcCompleteness, profile.exclusions]);

export function enrollLocalizedShadow(blankImage, profile, pageToSource, { confirmedExcludedRows = [] } = {}) {
  const validated = createMarkerlessProfile(profile);
  validateExcludedRows(confirmedExcludedRows, validated);
  if (!Array.isArray(pageToSource) || pageToSource.length !== 9 || pageToSource.some(value => !Number.isFinite(value))) {
    throw new TypeError('A confirmed blank-page transform is required.');
  }
  const gray = toGrayImage(blankImage);
  const knownRows = confirmedExcludedRows.map(({ id, choices }) => ({ id, choices: choices.map(({ x, y, radius }) => ({ x, y, radius })) }));
  if (knownRows.length) {
    const blank = observeScopeRows(gray, pageToSource, validated, knownRows);
    if (blank.status !== 'observed' || !corroboratedExcludedRows(validated, knownRows, blank.rows)) {
      throw new TypeError('The confirmed rows were not independently localized inside the supplied exclusions on the blank.');
    }
  }
  return { format, version, binding: binding(validated), mcSites: enrollMcPrint(gray, pageToSource, validated), knownRows };
}

function coverage(profile, sites) {
  const mcBlocks = profile.components.filter(block => block.kind === 'mc');
  return {
    header: { expected: mcBlocks.reduce((sum, block) => sum + Math.max(...block.items.map(item => item.choices.length)), 0),
      enrolled: sites.filter(site => site.kind === 'header').length },
    number: { expected: mcBlocks.reduce((sum, block) => sum + block.items.length, 0),
      enrolled: sites.filter(site => site.kind === 'number').length },
  };
}

export function evaluateLocalizedShadow(image, profile, { evidence, ...options } = {}) {
  const established = readProfileSheet(image, profile, options);
  try {
    if (established.status !== 'read' && !established.registration.reasons.every(reason => reason === 'response-geometry')) {
      return { established, shadow: { status: 'established-veto', reasons: established.registration.reasons } };
    }
    if (evidence === undefined) return { established, shadow: { status: 'unavailable', reason: 'no-enrollment' } };
    const validated = createMarkerlessProfile(profile);
    if (evidence?.format !== format || evidence.version !== version || evidence.binding !== binding(validated) ||
        !validMcPrint(evidence.mcSites, validated)) throw new TypeError('Invalid or stale shadow enrollment.');
    validateExcludedRows(evidence.knownRows, validated);

    const registration = established.registration;
    const matrix = registration.pageToSource ?? (options.corners ? pageTransform(validated.page, options.corners) : null);
    if (!matrix) return { established, shadow: { status: 'unavailable', reason: 'no-trusted-pose' } };
    const gray = toGrayImage(image);
    const observed = observeScopeRows(gray, matrix, validated, evidence.knownRows);
    const structure = observed.status === 'observed'
      ? { ...observed, ...classifyScopeEvidence(validated, evidence.knownRows, observed.rows) } : observed;
    const sites = established.status === 'read' ? compareMcPrint(gray, registration, evidence.mcSites) : [];
    return { established, shadow: { status: 'evaluated', structure, mc: {
      status: established.status === 'read' ? 'sampled' : 'established-withheld',
      coverage: coverage(validated, evidence.mcSites), sites, semanticAssurance: false,
    } } };
  } catch {
    return { established, shadow: { status: 'unavailable', reason: 'invalid-evidence-or-shadow-failure' } };
  }
}
