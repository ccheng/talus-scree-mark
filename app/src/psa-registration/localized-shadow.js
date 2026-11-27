import { pageTransform } from '../markerless-registration.js';
import { toGrayImage } from '../omr-image.js';
import { createMarkerlessProfile } from '../profile-authoring.js';
import { readProfileSheet } from '../profile-omr.js';
import { compareMcPrint, enrollAdaptiveMcPrint, validAdaptiveMcPrint, validMcPrint } from './mc-same-print.js';
import { shadowSampling } from './independent-sampling.js';
import { compareFootprintInventory, discoverResidualFootprints, validFootprintInventory } from './reference-footprints.js';
import { classifyScopeEvidence, corroboratedExcludedRows, matches, observeScopeRows, validateExcludedRows } from './scope-shadow.js';

import { teacherIntervention } from './teacher-intervention.js';

const format = 'talus-localized-registration-shadow';
const version = 3;
const binding = profile => JSON.stringify([profile.id, profile.revision, profile.page, profile.components,
  profile.scope, profile.mcCompleteness, profile.exclusions]);

function unclassifiedRows(profile, knownRows, rows) {
  const classified = [...profile.components.filter(block => block.kind === 'mc').flatMap(block => block.items), ...knownRows];
  return rows.filter(row => !classified.some(other => matches(other, row))).map(({ id, choices }) => ({ id, choices }));
}

function footprintObservation(gray, matrix, profile, knownRows, arbitrate) {
  const { rings = [], ...lanes } = observeScopeRows(gray, matrix, profile, knownRows, { includeRings: true });
  const residual = discoverResidualFootprints(gray, matrix, { ...lanes, rings }, { arbitrate });
  const rows = [...(lanes.rows ?? []), ...residual.rows];
  return { lanes, rings, residual, rows };
}

export function enrollLocalizedShadow(blankImage, profile, pageToSource, { confirmedExcludedRows = [] } = {}) {
  const validated = createMarkerlessProfile(profile);
  validateExcludedRows(confirmedExcludedRows, validated);
  if (!Array.isArray(pageToSource) || pageToSource.length !== 9 || pageToSource.some(value => !Number.isFinite(value))) {
    throw new TypeError('A confirmed blank-page transform is required.');
  }
  const gray = toGrayImage(blankImage);
  const knownRows = confirmedExcludedRows.map(({ id, choices }) => ({ id, choices: choices.map(({ x, y, radius }) => ({ x, y, radius })) }));
  const blank = footprintObservation(gray, pageToSource, validated, knownRows, true);
  if (knownRows.length && (blank.lanes.status !== 'observed' ||
      !corroboratedExcludedRows(validated, knownRows, blank.rows))) {
    throw new TypeError('The confirmed rows were not independently localized inside the supplied exclusions on the blank.');
  }
  return { format, version, binding: binding(validated), mcSites: enrollAdaptiveMcPrint(gray, pageToSource, validated),
    knownRows, footprintInventory: {
      status: blank.residual.status === 'observed' && !blank.residual.ambiguous.length ? 'observed' : 'unavailable',
      rows: unclassifiedRows(validated, knownRows, blank.rows),
    }, pairInventory: {
      status: blank.residual.status === 'observed' && !blank.residual.ambiguous.length ? 'observed' : 'unavailable',
      rows: (blank.residual.tentative ?? []).map(({ id, choices }) => ({ id, choices })),
    }, ambiguityInventory: {
      status: blank.residual.status,
      rows: blank.residual.ambiguous.map(({ id, choices }) => ({ id, choices })),
    } };
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

function evaluateShadow(image, profile, { evidence, ...options } = {}) {
  const established = readProfileSheet(image, profile, options);
  try {
    if (established.status !== 'read' && !established.registration.reasons.every(reason => reason === 'response-geometry')) {
      return { established, shadow: { status: 'established-veto', reasons: established.registration.reasons } };
    }
    if (evidence === undefined) return { established, shadow: { status: 'unavailable', reason: 'no-enrollment' } };
    const validated = createMarkerlessProfile(profile);
    const legacy = evidence?.version === 1;
    const extended = evidence?.version === version;
    if (evidence?.format !== format || (!legacy && evidence.version !== 2 && !extended) || evidence.binding !== binding(validated) ||
        !(legacy ? validMcPrint(evidence.mcSites, validated) : validAdaptiveMcPrint(evidence.mcSites, validated)) ||
        (!legacy && !validFootprintInventory(evidence.footprintInventory, validated.page)) ||
        (extended && (!validFootprintInventory(evidence.pairInventory, validated.page) ||
          evidence.pairInventory.rows.some(row => row.choices.length !== 2) ||
          !validFootprintInventory(evidence.ambiguityInventory, validated.page)))) {
      throw new TypeError('Invalid or stale shadow enrollment.');
    }
    validateExcludedRows(evidence.knownRows, validated);

    const registration = established.registration;
    const matrix = registration.pageToSource ?? (options.corners ? pageTransform(validated.page, options.corners) : null);
    if (!matrix) return { established, shadow: { status: 'unavailable', reason: 'no-trusted-pose' } };
    const gray = toGrayImage(image);
    const observed = legacy ? observeScopeRows(gray, matrix, validated, evidence.knownRows) : null;
    const footprints = legacy ? null : footprintObservation(gray, matrix, validated, evidence.knownRows, extended);
    const lanes = observed ?? footprints.lanes;
    const rows = observed?.rows ?? footprints?.rows;
    const structure = lanes.status === 'observed'
      ? { ...lanes, rows, ...classifyScopeEvidence(validated, evidence.knownRows, rows) } : lanes;
    if (footprints && lanes.status === 'observed') {
      const inventory = evidence.footprintInventory;
      const compared = compareFootprintInventory(inventory.rows, unclassifiedRows(validated, evidence.knownRows, rows));
      Object.assign(structure, {
        coverage: 'bounded MC lanes and residual 3–8-choice sequences',
        wholeSheetCompatible: null,
        unsupported: ['unassociated-two-choice-rows', 'overlapping-or-closely-spaced-rows', 'cropped-or-unresolved-outlines'],
        ambiguous: footprints.residual.ambiguous,
        residual: { status: footprints.residual.status, reason: footprints.residual.reason, rows: footprints.residual.rows.length },
        inventory: { status: inventory.status === 'observed' && footprints.residual.status === 'observed'
          ? 'compared' : 'incomplete', ...compared },
      });
      if (extended) {
        const pairs = footprints.residual.tentative ?? [];
        const reference = evidence.pairInventory;
        structure.tentativePairs = pairs;
        const ambiguityReference = evidence.ambiguityInventory;
        structure.ambiguityInventory = {
          status: ambiguityReference.status === 'observed' && footprints.residual.status === 'observed'
            ? 'compared' : 'incomplete',
          ...compareFootprintInventory(ambiguityReference.rows, footprints.residual.ambiguous),
        };
        structure.pairInventory = {
          status: reference.status === 'observed' && footprints.residual.status === 'observed' &&
            !footprints.residual.ambiguous.length ? 'compared' : 'incomplete',
          ...compareFootprintInventory(reference.rows, pairs),
        };
      }
      if (structure.status === 'geometry-consistent' &&
          (structure.ambiguous.length || compared.ambiguous.length || compared.missing.length ||
            structure.inventory.status === 'incomplete')) {
        structure.status = 'review';
        structure.reason = 'incomplete-or-ambiguous-structural-evidence';
      }
    }
    const uncorrectedSites = established.status === 'read' ? compareMcPrint(gray, registration, evidence.mcSites) : [];
    const sampling = !legacy && established.status === 'read'
      ? shadowSampling(validated, registration, footprints.rings, evidence.mcSites) : null;
    const sites = sampling?.blocks.some(block => block.correctedSites)
      ? compareMcPrint(gray, registration, evidence.mcSites, sampling.matrixForSite) : uncorrectedSites;
    return { established, shadow: { status: 'evaluated', structure, mc: {
      status: established.status === 'read' ? 'sampled' : 'established-withheld',
      coverage: coverage(validated, evidence.mcSites), sites, uncorrectedSites,
      sampling: sampling ? sampling.blocks : [], semanticAssurance: false,
    } } };
  } catch {
    return { established, shadow: { status: 'unavailable', reason: 'invalid-evidence-or-shadow-failure' } };
  }
}

export function evaluateLocalizedShadow(image, profile, options) {
  const result = evaluateShadow(image, profile, options);
  return { established: result.established, shadow: { ...result.shadow,
    intervention: teacherIntervention(result.established, result.shadow, profile),
  } };
}
