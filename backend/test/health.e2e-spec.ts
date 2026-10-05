import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { HealthReport } from './../src/common/health';
import { AppModule } from './../src/app.module';

/**
 * `GET /health` over HTTP, from the whole `AppModule`. The unit spec calls
 * `report()` directly, so only this shows that the route is mounted where
 * `systemctl status` asks for it and that answering it over the wire still calls
 * no upstream. It reads whatever `.env` the run happens to have, so it pins the
 * report's shape and leaves each unit's state to the unit spec.
 */
describe('GET /health (e2e)', () => {
  let app: INestApplication<App>;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('no network in tests'));
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    fetchSpy.mockRestore();
  });

  it('answers 200 with a JSON report, and fetches nothing to write it', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('Content-Type', /json/);
    const report = res.body as HealthReport;
    expect(typeof report.uptime).toBe('number');
    expect(report.units.length).toBeGreaterThan(0);
    for (const unit of report.units) {
      expect(typeof unit.unit).toBe('string');
      expect(['active', 'inactive']).toContain(unit.state);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
