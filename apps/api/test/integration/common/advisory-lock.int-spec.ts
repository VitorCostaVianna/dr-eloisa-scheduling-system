import { randomUUID } from 'node:crypto';
import { lockSchedule } from '../../../src/common/prisma/advisory-lock';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { createTestApp, type TestApp } from '../../support/app';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nunca deixa o teste pendurado se o lock não liberar. */
function within<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout: ${label}`)), ms),
    ),
  ]);
}

// "Tech check" da arquitetura 2.8: pg_advisory_xact_lock serializa por profissional.
describe('lockSchedule (advisory lock por profissional)', () => {
  let ctx: TestApp;
  let prisma: PrismaService;

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const TX = { maxWait: 5_000, timeout: 10_000 };

  /** A pega o lock de `idA`, avisa e espera `release`; B tenta o de `idB` depois. */
  async function run(idA: string, idB: string, order: string[]) {
    const aLocked = deferred();
    const release = deferred();
    const txA = prisma.$transaction(async (tx) => {
      await lockSchedule(tx, idA);
      aLocked.resolve();
      await release.promise;
      order.push('A-commit');
    }, TX);
    // Se o lock de A falhar, a rejeição de txA aparece aqui (não trava esperando aLocked).
    try {
      await within(
        Promise.race([aLocked.promise, txA]),
        5_000,
        'A pegar o lock',
      );
    } catch (e) {
      release.resolve();
      throw e;
    }
    const txB = prisma.$transaction(async (tx) => {
      await lockSchedule(tx, idB);
      order.push('B-locked');
    }, TX);
    return { txA, txB, release };
  }

  it('mesma profissional: a 2ª transação só passa depois do commit da 1ª', async () => {
    // Dado
    const id = randomUUID();
    const order: string[] = [];
    const { txA, txB, release } = await run(id, id, order);
    try {
      // Quando B tem tempo de sobra para passar, se o lock não funcionasse
      await sleep(500);
      // Então ainda bloqueada
      expect(order).toEqual([]);
    } finally {
      release.resolve();
    }
    await within(Promise.all([txA, txB]), 10_000, 'commits');
    expect(order).toEqual(['A-commit', 'B-locked']);
  });

  it('profissionais diferentes: a 2ª passa antes do commit da 1ª', async () => {
    const order: string[] = [];
    const { txA, txB, release } = await run(randomUUID(), randomUUID(), order);
    try {
      await within(txB, 5_000, 'B não deveria esperar A');
      expect(order).toEqual(['B-locked']);
    } finally {
      release.resolve();
    }
    await within(txA, 10_000, 'commit de A');
    expect(order).toEqual(['B-locked', 'A-commit']);
  });
});
