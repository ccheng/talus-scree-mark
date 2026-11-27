import { pageTransform, proposePageCorners } from '../markerless-registration.js';
import { grayAt, toGrayImage } from '../omr-image.js';
import { createMarkerlessProfile } from '../profile-authoring.js';
import { readProfileSheet } from '../profile-omr.js';
import { project } from '../projective.js';
import { assessGeometry, enrollGeometryAnchors, validateGeometryAnchors } from './geometry.js';
import { compareSemanticEvidence, enrollSemanticEvidence, validatedSemanticSites } from './semantic.js';

const format = 'talus-registration-evidence';
const version = 1;
const hardVeto = new Set(['invalid-profile', 'batch-not-confirmed', 'multiple-sheets',
  'mirrored-registration', 'ambiguous-orientation', 'printed-landmark-conflict', 'clipped-content']);

function profileBinding(profile) {
  return JSON.stringify([profile.id, profile.revision, profile.page, profile.scope, profile.mcCompleteness,
    profile.exclusions, profile.components]);
}

function samplePage(gray, matrix) {
  return (x, y) => {
    const point = project(matrix, x, y);
    return point ? grayAt(gray, point.x, point.y) : NaN;
  };
}

export function enrollRegistrationEvidence(blankImage, profile, pageToSource) {
  const validated = createMarkerlessProfile(profile);
  if (!Array.isArray(pageToSource) || pageToSource.length !== 9 || pageToSource.some(value => !Number.isFinite(value))) {
    throw new TypeError('A confirmed blank-page transform is required.');
  }
  const sample = samplePage(toGrayImage(blankImage), pageToSource);
  const sites = enrollSemanticEvidence(validated, sample);
  const anchors = enrollGeometryAnchors(validated, sample);
  const evidence = { format, version, binding: profileBinding(validated), sites, anchors };
  validateRegistrationEvidence(evidence, validated);
  return evidence;
}

export function validateRegistrationEvidence(evidence, profile) {
  const validated = createMarkerlessProfile(profile);
  if (evidence?.format !== format || evidence.version !== version || evidence.binding !== profileBinding(validated)) {
    throw new TypeError('Registration evidence belongs to a different profile revision or mapping.');
  }
  validateGeometryAnchors(evidence.anchors, validated);
  return validatedSemanticSites(evidence.sites, validated);
}

function annotate(established, diagnostics, reason) {
  const registration = {
    ...established.registration,
    diagnostics: { ...established.registration.diagnostics, psaRegistration: diagnostics },
  };
  if (!reason) return { ...established, registration };
  return { ...established, status: 'retake', items: [], registration: {
    status: 'retake', reasons: [reason], diagnostics: registration.diagnostics,
  }};
}

// Development entry point. Keep the established reader's output unless enrolled
// print contradicts it. Geometric proposals are telemetry and cannot authorize reads.
export function readStructuredRegistration(image, profile, { evidence, assessPose = false, ...options } = {}) {
  const established = readProfileSheet(image, profile, options);
  if (evidence === undefined || established.registration.reasons?.some(reason => hardVeto.has(reason))) return established;
  let enrollment;
  try {
    enrollment = validateRegistrationEvidence(evidence, profile);
  } catch {
    return annotate(established, { status: 'invalid-enrollment' }, 'invalid-registration-evidence');
  }

  const registration = established.registration;
  const gray = toGrayImage(image);
  const diagnostics = { ...enrollment, status: 'established-withheld' };
  if (assessPose) {
    const corners = registration.pageToSource ? null : options.corners ?? proposePageCorners(image);
    const matrix = registration.pageToSource ?? (corners ? pageTransform(profile.page, corners) : null);
    diagnostics.geometry = matrix ? assessGeometry(profile, evidence.anchors, samplePage(gray, matrix)) : { status: 'no-pose' };
  }
  if (established.status !== 'read') return annotate(established, diagnostics);
  const samplers = new Map(profile.components.map(({ id }) => [id, samplePage(gray,
    registration.refinedBlocks?.find(block => block.id === id)?.matrix ?? registration.pageToSource)]));
  const comparison = compareSemanticEvidence(evidence.sites, site => samplers.get(site.block));
  Object.assign(diagnostics, comparison);
  diagnostics.status = comparison.confirmed.length ? 'semantic-conflict'
    : comparison.observations.length ? 'no-confirmed-conflict' : 'semantic-unavailable';
  return annotate(established, diagnostics, comparison.confirmed.length ? 'enrolled-print-conflict' : undefined);
}
