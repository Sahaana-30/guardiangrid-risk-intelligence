import { isPostgresConfigured, isPostgresRequired } from '../index.ts';
import { JsonEmergencyRepository } from './jsonEmergencyRepository.ts';
import { PostgresEmergencyRepository } from './postgresEmergencyRepository.ts';
import type { IEmergencyRepository } from './types.ts';

const postgresRepo = new PostgresEmergencyRepository();
const jsonRepo = new JsonEmergencyRepository();

export function isUsingPostgresRepository(): boolean {
  if (isPostgresRequired()) {
    if (!isPostgresConfigured() || process.env.USE_JSON_FALLBACK === 'true') {
      throw new Error(
        'REQUIRE_POSTGRES=true requires SQL_HOST, SQL_USER, SQL_PASSWORD, SQL_DB_NAME and USE_JSON_FALLBACK!=true.'
      );
    }
    return true;
  }
  return isPostgresConfigured() && process.env.USE_JSON_FALLBACK !== 'true';
}

export function getEmergencyRepository(): IEmergencyRepository {
  return isUsingPostgresRepository() ? postgresRepo : jsonRepo;
}

export type { IEmergencyRepository, IncidentScope } from './types.ts';
