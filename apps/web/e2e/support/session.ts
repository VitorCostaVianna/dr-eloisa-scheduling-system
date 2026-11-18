import { resolve } from 'node:path';

/** Cookies da dentista salvos pelo primeiro login. Em test-results/ (ignorado pelo git). */
export const SESSION_FILE = resolve(__dirname, '../../test-results/dentist-session.json');
