import {compile} from 'sass';
import {fileURLToPath} from 'node:url';

export const stylesheet = compile(fileURLToPath(new URL('../style/stylesheet.scss', import.meta.url))).css;
