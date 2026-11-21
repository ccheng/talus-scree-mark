import { cross } from './projective.js';

function inside(page, x, y, halfExtent) {
  return [x, y, halfExtent].every(Number.isFinite) && halfExtent > 0 &&
    x - halfExtent >= 0 && y - halfExtent >= 0 && x + halfExtent <= page.width && y + halfExtent <= page.height;
}

function contains(bounds, x, y, radius) {
  return x - radius >= bounds.x && y - radius >= bounds.y &&
    x + radius <= bounds.x + bounds.width && y + radius <= bounds.y + bounds.height;
}

export function itemChoices(item) {
  return item.kind === 'mc' ? item.choices : item.slots.flatMap((slot) => slot.choices);
}

// These constraints belong to the coded-marker reference strategy.
export function validReferenceProfile(profile) {
  const page = profile?.page;
  if (!page || !Number.isFinite(page.width) || !Number.isFinite(page.height) || page.width <= 0 || page.height <= 0 ||
      page.origin !== 'top-left' || page.orientation !== 'portrait' || page.units !== 'pt' ||
      typeof profile.id !== 'string' || !profile.id || !Number.isInteger(profile.revision) || profile.revision < 1 ||
      profile.anchors?.length !== 4 || !profile.discriminator || !Array.isArray(profile.checks) ||
      profile.checks.length < 6 || !Array.isArray(profile.items) || !profile.items.length) return false;

  const ids = new Set();
  function unique(id) {
    if (typeof id !== 'string' || !id || ids.has(id)) return false;
    ids.add(id);
    return true;
  }

  for (const tag of [...profile.anchors, profile.discriminator]) {
    if (!tag || !unique(tag.id) || !inside(page, tag.x, tag.y, tag.size / 2) ||
        !Array.isArray(tag.code) || tag.code.length !== 4 || !tag.code.every((row) => /^[01]{4}$/.test(row))) return false;
  }
  if (!profile.anchors.every((point, i, anchors) => cross(point, anchors[(i + 1) % 4], anchors[(i + 2) % 4]) > 0)) return false;

  for (const check of profile.checks) {
    if (!check || !unique(check.id) || !inside(page, check.x, check.y, check.radius * 2.2)) return false;
  }

  const choices = [];
  function validChoices(options, bounds, kind) {
    if (!Array.isArray(options) || !options.length) return false;
    const symbols = new Set();
    for (const option of options) {
      if (!option || typeof option.symbol !== 'string' || !(kind === 'mc' ? /^[A-D]$/ : /^[0-9.]$/).test(option.symbol) ||
          symbols.has(option.symbol) || !inside(page, option.x, option.y, option.radius * 1.6) ||
          !contains(bounds, option.x, option.y, option.radius * 1.65)) return false;
      symbols.add(option.symbol);
      choices.push(option);
    }
    return true;
  }
  for (const item of profile.items) {
    const bounds = item?.bounds;
    if (!item || !unique(item.id) || !bounds ||
        ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
        bounds.width <= 0 || bounds.height <= 0 || bounds.x < 0 || bounds.y < 0 ||
        bounds.x + bounds.width > page.width || bounds.y + bounds.height > page.height) return false;
    if (item.kind === 'mc') {
      if (item.choices?.length !== 4 || !validChoices(item.choices, bounds, 'mc')) return false;
    } else if (item.kind === 'nr') {
      if (item.slots?.length !== 4 || !item.slots.every((slot) => slot && unique(slot.id) && validChoices(slot.choices, bounds, 'nr'))) return false;
    } else return false;
  }

  return choices.every((choice, index) => choices.slice(index + 1).every((other) =>
    Math.hypot(choice.x - other.x, choice.y - other.y) > choice.radius + other.radius));
}
