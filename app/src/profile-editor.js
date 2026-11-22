import { capturePrintedFeatures, pageTransform, proposePageCorners } from './markerless-registration.js';
import { createMarkerlessProfile, manualGrid, proposeGrid, validBounds } from './profile-authoring.js';
import { cross, project } from './projective.js';

const byId = (id) => document.getElementById(id);
const value = (id) => byId(id).value;
const number = (id) => byId(id).valueAsNumber;
const write = (id, next) => { byId(id).value = Number.isFinite(next) ? Number(next.toFixed(2)) : next; };
const coordinates = (x, y) => ({ x, y });
const idFor = (prefix) => prefix + '-' + crypto.randomUUID().slice(0, 8);

export function sourceOnCanvas(canvas, image) {
  const scale = Math.min(1, 910 / Math.max(image.width, image.height));
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  source.getContext('2d').putImageData(image.pixels, 0, 0);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  source.width = source.height = 1;
}

function rectifiedOnCanvas(canvas, image, matrix, page) {
  const factor = 840 / Math.max(page.width, page.height);
  canvas.width = Math.round(factor * page.width);
  canvas.height = Math.round(factor * page.height);
  const ctx = canvas.getContext('2d');
  const output = ctx.createImageData(canvas.width, canvas.height);
  const source = image.pixels.data;
  for (let y = 0; y < output.height; y++) {
    for (let x = 0; x < output.width; x++) {
      const target = project(matrix, x / factor, y / factor);
      const tx = Math.round(target?.x);
      const ty = Math.round(target?.y);
      const index = (y * output.width + x) * 4;
      if (!target || tx < 0 || ty < 0 || tx >= image.width || ty >= image.height) {
        output.data[index] = output.data[index + 1] = output.data[index + 2] = 255;
      } else {
        const at = (ty * image.width + tx) * 4;
        output.data[index] = source[at]; output.data[index + 1] = source[at + 1]; output.data[index + 2] = source[at + 2];
      }
      output.data[index + 3] = 255;
    }
  }
  ctx.putImageData(output, 0, 0);
}

export function createProfileEditor({ onSave, onClose }) {
  const panel = byId('profile-editor');
  const canvas = byId('profile-canvas');
  const background = document.createElement('canvas');
  const status = byId('editor-status');
  const blocksList = byId('profile-blocks');
  const featuresList = byId('profile-features');
  const notConfirmed = () => { byId('confirm-profile-preview').checked = false; };
  const say = (msg) => { status.textContent = msg; };
  let state;

  function page() {
    const orientation = value('profile-orientation');
    return {
      width: orientation === 'portrait' ? 612 : 792, height: orientation === 'portrait' ? 792 : 612,
      units: 'pt', origin: 'top-left', orientation,
    };
  }

  function fullFrame() {
    const { width, height } = state.image;
    return [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }];
  }

  function show(message) {
    byId('profile-grid-controls').hidden = !state.matrix;
    byId('apply-blank-corners').disabled = state.corners.length !== 4 || Boolean(state.matrix);
    if (message) say(message);
    paint();
  }

  function paint() {
    if (!state) return;
    canvas.width = background.width;
    canvas.height = background.height;
    canvas.dataset.zoom = String(state.zoom);
    canvas.dataset.pan = String(state.pan);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(background, 0, 0);
    const logical = state.matrix ? page() : state.image;
    ctx.scale(canvas.width / logical.width, canvas.height / logical.height);
    ctx.lineWidth = state.matrix ? 1.5 : 3 / Math.min(canvas.width / logical.width, canvas.height / logical.height);
    ctx.font = state.matrix ? '9px system-ui' : `${Math.max(15, logical.width / 52)}px system-ui`;
    function box(bounds, color, name) {
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      if (name) ctx.fillText(name, bounds.x + 2, bounds.y + 10);
    }
    function dot(point, radius, color, name) {
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI); ctx.stroke();
      if (name) ctx.fillText(name, point.x + radius + 1, point.y - radius);
    }
    if (!state.matrix) {
      state.corners.forEach((point, index) => dot(point, logical.width / 75, '#a33415', String(index + 1)));
      return;
    }
    for (const feature of state.features) box(feature.bounds, '#753d94', 'Printed feature');
    for (const [index, block] of state.blocks.entries()) {
      box(block.bounds, '#287651', `Block ${index + 1}`);
      for (const item of block.items) {
        const choices = item.kind === 'mc' ? item.choices : item.slots.flatMap((slot) => slot.choices);
        for (const choice of choices) dot(choice, choice.radius + .75, '#287651', `${item.id} ${choice.symbol}`);
      }
    }
    if (state.region) box(state.region, '#245c8e');
    for (const cell of (state.grid?.cells ?? [])) {
      if (!cell.omit) dot(cell, cell.radius + 1, cell.missing ? '#c05224' : '#245c8e', cell.symbol || '?');
    }
    state.endpoints?.forEach((point, index) => dot(point, 4, '#a33415', String(index + 1)));
  }

  function resetCorners() {
    state.matrix = null;
    state.corners = [];
    state.grid = null;
    state.region = null;
    state.editing = null;
    state.endpoints = null;
    notConfirmed();
    sourceOnCanvas(background, state.image);
    show('Tap the blank page corners in sheet order. Existing regions still use the same sheet coordinates.');
  }

  function confirmCorners() {
    const ordered = state.corners.length === 4 && state.corners.every((point, index, corners) =>
      cross(point, corners[(index + 1) % 4], corners[(index + 2) % 4]) > 0);
    if (!ordered) return say('Place the corners clockwise in sheet order, starting at top left.');
    const matrix = pageTransform(page(), state.corners);
    if (!matrix) return say('The corners do not form a usable page. Place them again.');
    state.matrix = matrix;
    rectifiedOnCanvas(background, state.image, matrix, page());
    show('Draw a box around one answer block or fixed printed feature.');
  }

  function pointAt(event) {
    const bounds = canvas.getBoundingClientRect();
    const space = state.matrix ? page() : state.image;
    return {
      x: Math.max(0, Math.min(space.width - .01, (event.clientX - bounds.left) * space.width / bounds.width)),
      y: Math.max(0, Math.min(space.height - .01, (event.clientY - bounds.top) * space.height / bounds.height)),
    };
  }

  function setRegion(region) {
    if (!validBounds(region)) throw new TypeError('Give the box a positive width and height.');
    const frame = page();
    if (region.x < 0 || region.y < 0 || region.x + region.width > frame.width || region.y + region.height > frame.height) {
      throw new TypeError('Keep the box within the blank sheet.');
    }
    state.region = region;
    for (const [key, field] of Object.entries(region)) write('region-' + key, field);
    paint();
    return region;
  }

  function inputRegion() {
    return setRegion({ x: number('region-x'), y: number('region-y'), width: number('region-width'), height: number('region-height') });
  }

  function counts() { return { rows: number('grid-rows'), columns: number('grid-columns') }; }

  function axes() {
    return {
      topLeft: coordinates(number('grid-first-x'), number('grid-first-y')),
      topRight: coordinates(number('grid-across-x'), number('grid-across-y')),
      bottomLeft: coordinates(number('grid-down-x'), number('grid-down-y')),
      ...counts(), radius: number('grid-radius'),
    };
  }

  function setEndpoints(topLeft, topRight, bottomLeft, radius) {
    write('grid-first-x', topLeft.x); write('grid-first-y', topLeft.y);
    write('grid-across-x', topRight.x); write('grid-across-y', topRight.y);
    write('grid-down-x', bottomLeft.x); write('grid-down-y', bottomLeft.y);
    write('grid-radius', radius);
    const { rows, columns } = counts();
    const dx = topRight.x - topLeft.x, dy = topRight.y - topLeft.y;
    write('grid-column-spacing', Math.hypot(dx, dy) / Math.max(1, columns - 1));
    write('grid-row-spacing', Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y) / Math.max(1, rows - 1));
    write('grid-angle', Math.atan2(dy, dx) * 180 / Math.PI);
  }

  function defaultAxes(region, radius) {
    const inset = radius + 1;
    const first = { x: region.x + inset, y: region.y + inset };
    const across = { x: region.x + region.width - inset, y: first.y };
    const down = { x: first.x, y: region.y + region.height - inset };
    return [first, across, down];
  }

  function labelGrid(grid) {
    const kind = value('block-kind');
    const transpose = value('grid-axis') === 'columns';
    const order = value('grid-symbols').split(',').map((symbol) => symbol.trim()).filter(Boolean);
    const decimalSlots = new Set(value('decimal-slots').split(',').map((index) => Number(index.trim())));
    const slotCount = transpose ? grid.rows : grid.columns;
    if (kind === 'nr' && slotCount !== 4) throw new TypeError('An NR grid needs exactly four slot columns or rows.');
    const expectedSymbols = kind === 'mc' ? (transpose ? grid.rows : grid.columns) : (transpose ? grid.columns : grid.rows);
    if (order.length !== expectedSymbols) throw new TypeError('Enter one symbol per printed choice row or column.');
    const reversed = byId('reverse-grid-order').checked;
    for (const cell of grid.cells) {
      const symbolIndex = kind === 'mc' ? (transpose ? cell.row : cell.column) : (transpose ? cell.column : cell.row);
      const index = kind === 'mc' ? (transpose ? cell.column : cell.row) : (transpose ? cell.row : cell.column);
      const total = kind === 'mc' ? (transpose ? grid.columns : grid.rows) : slotCount;
      cell.symbol = order[symbolIndex];
      cell.order = reversed ? total - index - 1 : index;
      cell.omit = kind === 'nr' && cell.symbol === '.' && !decimalSlots.has(cell.order + 1);
    }
  }

  function assignGrid(grid, auto = false) {
    state.grid = grid;
    labelGrid(grid);
    updateCellSelector();
    paint();
    notConfirmed();
    const missing = grid.cells.filter((cell) => cell.missing && !cell.omit).length;
    if (auto) say(`${grid.cells.filter((cell) => !cell.missing && !cell.omit).length} printed bubbles found. ${missing ? missing + ' expected places need adjustment.' : 'Review positions and symbols before confirming.'}`);
    else say('Check the grid overlay and correct any exceptions before confirming.');
  }

  function detect() {
    const region = inputRegion();
    const { rows, columns } = counts();
    const proposal = proposeGrid(state.image, state.matrix, region, { rows, columns });
    if (!proposal.cells.length) throw new TypeError('No reliable bubble lattice was found. Adjust the box or place the grid manually.');
    const known = new Map(proposal.cells.map((cell) => [`${cell.row}/${cell.column}`, cell]));
    const absent = new Map(proposal.missing.map((cell) => [`${cell.row}/${cell.column}`, cell]));
    const radius = proposal.radius;
    const estimated = defaultAxes(region, radius);
    const at = (row, column) => known.get(`${row}/${column}`) ?? absent.get(`${row}/${column}`);
    const topLeft = at(0, 0) ?? estimated[0];
    const topRight = at(0, columns - 1) ?? estimated[1];
    const bottomLeft = at(rows - 1, 0) ?? estimated[2];
    setEndpoints(topLeft, topRight, bottomLeft, radius);
    const preview = manualGrid(axes());
    preview.cells = preview.cells.map((fallback) => {
      const key = `${fallback.row}/${fallback.column}`;
      return known.get(key) ?? { ...fallback, ...absent.get(key), radius, missing: true };
    });
    assignGrid(preview, true);
  }

  function makeDefault() {
    const region = inputRegion();
    const radius = number('grid-radius');
    setEndpoints(...defaultAxes(region, radius), radius);
    assignGrid(manualGrid(axes()));
  }

  function makeSpaced() {
    const { topLeft, rows, columns, radius } = axes();
    const angle = number('grid-angle') * Math.PI / 180;
    const across = number('grid-column-spacing') * (columns - 1);
    const down = number('grid-row-spacing') * (rows - 1);
    const topRight = { x: topLeft.x + Math.cos(angle) * across, y: topLeft.y + Math.sin(angle) * across };
    const bottomLeft = { x: topLeft.x - Math.sin(angle) * down, y: topLeft.y + Math.cos(angle) * down };
    setEndpoints(topLeft, topRight, bottomLeft, radius);
    assignGrid(manualGrid(axes()));
  }

  function updateCellSelector() {
    const dropdown = byId('cell-selector');
    dropdown.replaceChildren(...state.grid.cells.map((cell, index) =>
      new Option(`Row ${cell.row + 1}, column ${cell.column + 1} · ${cell.symbol || '?'}${cell.omit ? ' (omitted)' : ''}`, String(index))));
    selectCell();
  }

  function selectCell() {
    const cell = state.grid?.cells[Number(value('cell-selector'))];
    if (!cell) return;
    write('cell-x', cell.x); write('cell-y', cell.y); write('cell-radius', cell.radius);
    byId('cell-symbol').value = cell.symbol;
    byId('cell-omit').checked = cell.omit;
  }

  function applyCell() {
    const index = Number(value('cell-selector'));
    const cell = state.grid?.cells[index];
    if (!cell) throw new TypeError('Place a grid before changing a position.');
    Object.assign(cell, {
      x: number('cell-x'), y: number('cell-y'), radius: number('cell-radius'), symbol: value('cell-symbol').trim(),
      omit: byId('cell-omit').checked, missing: false,
    });
    updateCellSelector();
    byId('cell-selector').value = String(index);
    selectCell();
    notConfirmed(); paint();
  }

  function smallerBounds(cells, enclosing) {
    const left = Math.max(enclosing.x, Math.min(...cells.map((cell) => cell.x - cell.radius * 1.30)));
    const right = Math.min(enclosing.x + enclosing.width, Math.max(...cells.map((cell) => cell.x + cell.radius * 1.30)));
    const top = Math.max(enclosing.y, Math.min(...cells.map((cell) => cell.y - cell.radius * 1.30)));
    const bottom = Math.min(enclosing.y + enclosing.height, Math.max(...cells.map((cell) => cell.y + cell.radius * 1.30)));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function confirmBlock() {
    const bounds = inputRegion();
    if (!state.grid) throw new TypeError('Find or place the bubble grid before confirming.');
    const kind = value('block-kind');
    const prefix = value('item-prefix').trim();
    const start = number('item-start');
    if (!/^[A-Za-z0-9_.-]{0,30}$/.test(prefix) || !Number.isInteger(start) || start < 1) {
      throw new TypeError('Use a valid item prefix and positive starting number.');
    }
    const available = state.grid.cells.filter((cell) => !cell.omit);
    if (available.some((cell) => cell.missing)) throw new TypeError('Correct or omit every missing bubble position.');
    const orders = [...new Set(state.grid.cells.map((cell) => cell.order))].sort((a, b) => a - b);
    const groups = orders.map((order) => available.filter((cell) => cell.order === order));
    const choices = (cells) => cells.map(({ symbol, x, y, radius }) => ({ symbol, x, y, radius }));
    const preserved = state.grid.existingIds;
    const preserveIds = preserved && prefix === preserved.prefix && start === preserved.first;
    const itemId = (index) => (preserveIds ? preserved.ids[index] : undefined) ?? `${prefix}${start + index}`;
    const items = kind === 'mc'
      ? groups.map((cells, index) => ({
        id: itemId(index), kind, bounds: smallerBounds(cells, bounds), choices: choices(cells),
      }))
      : [{ id: itemId(0), kind, bounds, slots: groups.map((cells, index) => ({
        id: `${itemId(0)}.${index + 1}`, choices: choices(cells),
      })) }];
    const block = { id: state.editing ?? idFor('block'), kind, bounds, items };
    const next = state.blocks.filter(({ id }) => id !== block.id);
    const oldIndex = state.blocks.findIndex(({ id }) => id === block.id);
    next.splice(oldIndex < 0 ? next.length : oldIndex, 0, block);
    // Validate mappings now, even if printed features are still being enrolled.
    createMarkerlessProfile({
      id: 'draft', revision: 1, name: 'Draft', page: page(), components: next, features: [], allowManualIdentity: true,
    });
    state.blocks = next;
    state.drafts.set(block.id, {
      grid: structuredClone(state.grid), fields: Object.fromEntries([
        'block-kind', 'grid-axis', 'grid-symbols', 'decimal-slots', 'item-prefix', 'item-start',
        'grid-rows', 'grid-columns', 'grid-first-x', 'grid-first-y', 'grid-across-x', 'grid-across-y',
        'grid-down-x', 'grid-down-y', 'grid-radius', 'grid-column-spacing', 'grid-row-spacing', 'grid-angle',
      ].map((id) => [id, value(id)])), reverse: byId('reverse-grid-order').checked,
    });
    state.editing = null;
    state.grid = null;
    state.region = null;
    write('item-start', start + items.length);
    byId('cell-selector').replaceChildren();
    notConfirmed();
    lists();
    show(`Confirmed ${items.length} ${kind.toUpperCase()} item${items.length === 1 ? '' : 's'}. Draw the next block or save the profile.`);
  }

  function restoreExisting(block) {
    const mc = block.kind === 'mc';
    const grouped = mc ? block.items.map(({ choices }) => choices) : block.items[0].slots.map(({ choices }) => choices);
    const symbols = mc ? grouped.reduce((longest, choices) => choices.length > longest.length ? choices : longest, []).map(({ symbol }) => symbol) :
      [...new Set(grouped.flatMap((choices) => choices.map(({ symbol }) => symbol)))];
    const rows = mc ? grouped.length : symbols.length;
    const columns = mc ? symbols.length : 4;
    const items = block.items.map(({ id }) => id);
    const numberSuffix = /^(.*?)([0-9]+)$/.exec(items[0]);
    const prefix = numberSuffix?.[1] ?? items[0];
    const first = Number(numberSuffix?.[2] ?? 1);
    const radius = grouped.flat()[0].radius;
    const [topLeft, topRight, bottomLeft] = defaultAxes(block.bounds, radius);
    const fallback = manualGrid({ topLeft, topRight, bottomLeft, rows, columns, radius });
    fallback.cells = fallback.cells.map((cell) => {
      const order = mc ? cell.row : cell.column;
      const symbolIndex = mc ? cell.column : cell.row;
      const choice = mc ? grouped[order][symbolIndex] : grouped[order].find(({ symbol }) => symbol === symbols[symbolIndex]);
      return { ...cell, ...choice, symbol: choice?.symbol ?? symbols[symbolIndex], order, omit: !choice };
    });
    fallback.existingIds = { ids: items, prefix, first };
    byId('block-kind').value = block.kind;
    byId('grid-axis').value = 'rows';
    byId('grid-symbols').value = symbols.join(',');
    byId('grid-rows').value = String(rows);
    byId('grid-columns').value = String(columns);
    byId('item-prefix').value = prefix;
    byId('item-start').value = String(first);
    byId('reverse-grid-order').checked = false;
    byId('decimal-slots').value = mc ? '' : grouped.flatMap((choices, index) =>
      choices.some(({ symbol }) => symbol === '.') ? [index + 1] : []).join(',');
    setEndpoints(topLeft, topRight, bottomLeft, radius);
    state.grid = fallback;
  }

  function chooseDraft(block) {
    state.editing = block.id;
    try {
      const saved = state.drafts.get(block.id);
      if (saved) {
        for (const [id, content] of Object.entries(saved.fields)) byId(id).value = content;
        byId('reverse-grid-order').checked = saved.reverse;
        state.grid = structuredClone(saved.grid);
      } else restoreExisting(block);
      byId('decimal-slots-label').hidden = block.kind !== 'nr';
      setRegion(block.bounds);
      updateCellSelector();
      show('Edit the box, grid or individual bubbles, then confirm this block again.');
    } catch (error) { state.editing = null; say(error.message); }
  }

  function listEntry(list, caption, actions) {
    const item = document.createElement('li');
    item.append(caption);
    for (const [label, run] of actions) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.addEventListener('click', run);
      item.append(button);
    }
    list.append(item);
  }

  function lists() {
    blocksList.replaceChildren();
    featuresList.replaceChildren();
    for (const [index, block] of state.blocks.entries()) {
      const move = (delta) => {
        const target = index + delta;
        [state.blocks[index], state.blocks[target]] = [state.blocks[target], state.blocks[index]];
        notConfirmed(); lists(); paint();
      };
      listEntry(blocksList, block.items.map(({ id }) => id).join(', '), [
        ['Edit block', () => chooseDraft(block)],
        ...(index ? [['Move up', () => move(-1)]] : []),
        ...(index + 1 < state.blocks.length ? [['Move down', () => move(1)]] : []),
        ['Remove', () => { state.blocks.splice(index, 1); notConfirmed(); lists(); paint(); }],
      ]);
    }
    state.features.forEach((feature, index) => listEntry(featuresList,
      `${index === 0 ? 'Identity' : 'Alignment'} feature at ${Math.round(feature.bounds.x)}, ${Math.round(feature.bounds.y)}`, [
        ['Remove', () => { state.features.splice(index, 1); notConfirmed(); lists(); paint(); }],
      ]));
  }

  function addFeature() {
    const bounds = inputRegion();
    if (state.features.length >= 16) throw new TypeError('Use no more than 16 printed features.');
    const [feature] = capturePrintedFeatures(state.image, state.matrix, [{ id: idFor('feature'), bounds }]);
    state.features.push(feature);
    notConfirmed(); lists(); paint();
    say('Printed feature added. Use clear printed details distributed across the sheet.');
  }

  function handle(id, action) {
    byId(id).addEventListener('click', () => {
      if (!state) return;
      try { action(); } catch (error) { say(error.message); }
    });
  }
  handle('editor-zoom-out', () => { state.zoom = Math.max(1, state.zoom - 1); paint(); });
  handle('editor-zoom-in', () => { state.zoom = Math.min(3, state.zoom + 1); paint(); });
  handle('editor-pan', () => {
    state.pan = !state.pan;
    byId('editor-pan').setAttribute('aria-pressed', String(state.pan));
    paint();
    say(state.pan ? 'Drag to pan the preview.' : 'Tap corners or drag a region on the sheet.');
  });
  handle('reset-blank-corners', resetCorners);
  handle('apply-blank-corners', confirmCorners);
  handle('preview-region', () => { inputRegion(); say('Box previewed.'); });
  handle('detect-grid', detect);
  handle('manual-grid', makeDefault);
  handle('apply-grid-endpoints', () => assignGrid(manualGrid(axes())));
  handle('apply-grid-spacing', makeSpaced);
  handle('pick-grid-endpoints', () => { state.endpoints = []; say('Tap first cell, last in first row, then last in first column.'); });
  handle('assign-grid-labels', () => {
    if (!state.grid) throw new TypeError('Place a grid before assigning labels.');
    assignGrid(state.grid);
  });
  handle('apply-cell', applyCell);
  handle('confirm-block', confirmBlock);
  handle('add-feature', addFeature);
  handle('cancel-profile-editor', () => { close(); onClose(); });
  handle('enroll-profile', async () => {
    if (!byId('confirm-profile-preview').checked) { say('Confirm the overlay and mappings before saving.'); return; }
    try {
      const profile = createMarkerlessProfile({
        id: state.prior?.id ?? idFor('layout'), revision: (state.prior?.revision ?? 0) + 1,
        name: value('profile-name'), page: page(), components: state.blocks,
        features: state.features, allowManualIdentity: byId('allow-manual-identity').checked,
      });
      byId('enroll-profile').disabled = true;
      await onSave(profile);
    } catch (error) { say(error.message); }
    finally { byId('enroll-profile').disabled = false; }
  });
  byId('profile-orientation').addEventListener('change', () => { if (state) resetCorners(); });
  byId('allow-manual-identity').addEventListener('change', notConfirmed);
  byId('cell-selector').addEventListener('change', selectCell);
  byId('block-kind').addEventListener('change', () => {
    const mc = value('block-kind') === 'mc';
    byId('decimal-slots-label').hidden = mc;
    byId('grid-symbols').value = mc ? 'A,B,C,D' : '.,0,1,2,3,4,5,6,7,8,9';
    byId('item-prefix').value = mc ? 'MC' : 'NR';
    write('grid-rows', mc ? 8 : 11);
    write('grid-columns', 4);
    write('item-start', 1 + (state?.blocks.filter(({ kind }) => kind === (mc ? 'mc' : 'nr'))
      .reduce((count, block) => count + block.items.length, 0) ?? 0));
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (!state || state.pan || event.button !== 0) return;
    state.drag = pointAt(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!state?.drag) return;
    const end = pointAt(event);
    const start = state.drag;
    state.drag = null;
    if (!state.matrix) {
      if (state.corners.length === 4) state.corners = [];
      state.corners.push(end);
      show(state.corners.length < 4 ? `${state.corners.length} of 4 corners marked.` : 'Check corner order, then use these corners.');
      return;
    }
    if (state.endpoints) {
      state.endpoints.push(end);
      if (state.endpoints.length === 3) {
        try {
          setEndpoints(...state.endpoints, number('grid-radius'));
          assignGrid(manualGrid(axes()));
        } catch (error) { say(error.message); }
        state.endpoints = null;
      }
      paint();
      return;
    }
    const width = Math.abs(start.x - end.x);
    const height = Math.abs(start.y - end.y);
    if (width >= 2 && height >= 2) {
      setRegion({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, height });
      say('Box set. Find bubbles, place a grid or add this printed feature.');
    }
  });
  canvas.addEventListener('pointercancel', () => { if (state) state.drag = null; });

  function open(image, prior) {
    state = {
      image, prior, matrix: null, zoom: 1, pan: false, blocks: structuredClone(prior?.components ?? []),
      features: structuredClone(prior?.features ?? []), drafts: new Map(),
    };
    byId('profile-name').value = prior?.name ?? '';
    byId('profile-orientation').value = prior?.page.orientation ?? (image.width > image.height ? 'landscape' : 'portrait');
    byId('allow-manual-identity').checked = prior?.allowManualIdentity ?? false;
    panel.hidden = false;
    byId('editor-pan').setAttribute('aria-pressed', 'false');
    resetCorners();
    const corners = proposePageCorners(image);
    state.corners = corners ?? [];
    if (!corners) say('Place four page corners in sheet order, starting at top left.');
    else show('Check the proposed corners and sheet orientation. You can place them again.');
    lists();
    byId('profile-name').focus();
  }

  function close() {
    state = null;
    panel.hidden = true;
    canvas.width = canvas.height = background.width = background.height = 1;
    blocksList.replaceChildren(); featuresList.replaceChildren();
  }

  return { open, close, get active() { return Boolean(state); } };
}
