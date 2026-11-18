import { config } from 'dotenv';
import { resolve } from 'path';

// Roda em cada worker do jest (setupFiles) antes de qualquer import da app: o
// PrismaClient lê DATABASE_URL de process.env no momento da construção.
config({ path: resolve(__dirname, '../../.env.test') });
