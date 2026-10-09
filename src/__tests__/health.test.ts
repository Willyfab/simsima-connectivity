import request from 'supertest';
import { createApp } from '../index';

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('icône du connecteur', () => {
  it('sert le favicon que Claude affiche à côté du connecteur', async () => {
    const res = await request(createApp()).get('/favicon.ico');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/icon/);
    expect(res.headers['cache-control']).toContain('max-age=86400');
  });

  it('sert une icône PNG haute définition', async () => {
    const res = await request(createApp()).get('/icon.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('déclare les icônes sur la page racine', async () => {
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('rel="icon" href="/favicon.ico"');
    expect(res.text).toContain('href="/icon.png"');
  });
});
