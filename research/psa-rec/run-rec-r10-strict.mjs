import fs from 'node:fs';
import {run} from './rec-r10-strict.mjs';
import {evaluateCompletion} from '../../app/src/cpas-recognition/completion.js';
import {createPredictor} from '../../app/src/cpas-recognition/forest.js';
import {readBubbleRegions,measureNumericalBlankInk} from '../../app/src/marks.js';
const meta=JSON.parse(fs.readFileSync(new URL('../../app/assets/cpas/completion-native.json',import.meta.url)));const bin=fs.readFileSync(new URL('../../app/assets/cpas/completion.bin',import.meta.url));
console.log(JSON.stringify(run({predict:createPredictor(meta,bin),evaluateCompletion,readBubbleRegions,measureNumericalBlankInk}),null,2));
