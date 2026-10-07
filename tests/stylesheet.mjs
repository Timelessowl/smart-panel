import * as Sass from 'sass';
import * as Url from 'node:url';

export const stylesheet = Sass.compile(Url.fileURLToPath(new URL('../src/style/stylesheet.scss', import.meta.url))).css;
