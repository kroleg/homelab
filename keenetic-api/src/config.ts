export interface Profile {
  id: string;
  name: string;
  isAdmin: boolean;
}

function loadProfiles(): Profile[] {
  // Format: PROFILE_IDS=VITALIY,LEV,POLYA
  // PROFILE_VITALIY_NAME=Виталий
  // PROFILE_VITALIY_ADMIN=true
  const profileIds = process.env.PROFILE_IDS?.split(',').map(s => s.trim()).filter(Boolean) || [];

  return profileIds.map(id => {
    const name = process.env[`PROFILE_${id}_NAME`] || id;
    const isAdmin = process.env[`PROFILE_${id}_ADMIN`] === 'true';
    return { id, name, isAdmin };
  });
}

export function loadConfig() {
  const port = parseInt(process.env.PORT || '3000');
  const logLevel = process.env.LOG_LEVEL || 'info';

  if (!process.env.KEENETIC_HOST) {
    throw new Error('KEENETIC_HOST environment variable is required');
  }
  if (!process.env.KEENETIC_LOGIN) {
    throw new Error('KEENETIC_LOGIN environment variable is required');
  }
  if (!process.env.KEENETIC_PASSWORD) {
    throw new Error('KEENETIC_PASSWORD environment variable is required');
  }

  const profiles = loadProfiles();

  return {
    port,
    logLevel,
    keeneticHost: process.env.KEENETIC_HOST,
    keeneticLogin: process.env.KEENETIC_LOGIN,
    keeneticPassword: process.env.KEENETIC_PASSWORD,
    profiles,
  };
}

export type Config = ReturnType<typeof loadConfig>;
