import request from 'supertest';
import { createTestApp, TestApp } from './support/app';

describe('AppController (e2e)', () => {
  let ctx: TestApp;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  it('/ (GET)', () => {
    return request(ctx.app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await ctx.app.close();
  });
});
