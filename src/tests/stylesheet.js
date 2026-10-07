import * as Sass from 'sass';
import * as Url from 'node:url';
import * as GjsHarness from '@/tests/gjsHarness.js';

export const stylesheet = Sass.compile(Url.fileURLToPath(new URL('style/stylesheet.scss', GjsHarness.sourceDirectory))).css;
