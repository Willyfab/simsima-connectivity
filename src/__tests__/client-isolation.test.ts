import request from 'supertest';
import { createApp } from '../index';

/**
 * Régression : sans `trust proxy` ni `CF-Connecting-IP`, `req.ip` valait l'IP de
 * Traefik pour tout le monde. Les 18 000 requêtes/3 j d'un scanner et les appels
 * d'un vrai client partageaient alors le même compteur, et le scan suffisait à
 * renvoyer des 429 au client.
 */
describe('débit par appelant réel', () => {
  const OLD = process.env.RATE_LIMIT_RPM;
  beforeAll(() => {
    process.env.RATE_LIMIT_RPM = '1';
  });
  afterAll(() => {
    process.env.RATE_LIMIT_RPM = OLD;
  });

  const call = (app: ReturnType<typeof createApp>, ip: string) =>
    request(app).post('/mcp').set('CF-Connecting-IP', ip).set('User-Agent', 'Claude-User').send({});

  it("n'impute pas à un client le débit d'un autre", async () => {
    const app = createApp();
    expect((await call(app, '1.1.1.1')).status).not.toBe(429);
    // Deuxième appelant, même proxy : doit passer malgré rpm=1.
    expect((await call(app, '2.2.2.2')).status).not.toBe(429);
    expect((await call(app, '3.3.3.3')).status).not.toBe(429);
  });

  it('limite toujours un appelant qui dépasse', async () => {
    const app = createApp();
    expect((await call(app, '9.9.9.9')).status).not.toBe(429);
    expect((await call(app, '9.9.9.9')).status).toBe(429);
  });

  it("donne à la sortie d'Anthropic son propre budget, plus large", async () => {
    const OLD_ANTHROPIC = process.env.RATE_LIMIT_RPM_ANTHROPIC;
    process.env.RATE_LIMIT_RPM_ANTHROPIC = '3';
    try {
      const app = createApp();
      // Une IP claude.ai porte les conversations de nombreux utilisateurs :
      // elle passe là où un appelant ordinaire (rpm=1) serait déjà bloqué…
      for (let i = 0; i < 3; i++) {
        expect((await call(app, '160.79.106.20')).status).not.toBe(429);
      }
      // … sans pour autant devenir illimitée.
      expect((await call(app, '160.79.106.20')).status).toBe(429);
    } finally {
      process.env.RATE_LIMIT_RPM_ANTHROPIC = OLD_ANTHROPIC;
    }
  });
});
