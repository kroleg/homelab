import http from 'http';
import type { Logger } from '../logger.ts';

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
}

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
}

export function createDockerService(socketPath: string, logger: Logger) {
  function dockerRequest<T>(method: string, path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        socketPath,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : ({} as T));
            } catch {
              resolve({} as T);
            }
          } else if (res.statusCode === 304) {
            // Container already in desired state
            resolve({} as T);
          } else {
            reject(new Error(`Docker API error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  async function listContainers(all = false): Promise<ContainerInfo[]> {
    const containers = await dockerRequest<DockerContainer[]>(
      'GET',
      `/containers/json?all=${all}`
    );

    return containers.map((c) => ({
      id: c.Id.substring(0, 12),
      name: c.Names[0].replace(/^\//, ''),
      image: c.Image.split(':')[0].split('/').pop() || c.Image,
      state: c.State,
      status: c.Status,
    }));
  }

  async function findContainers(
    partialName: string,
    running?: boolean
  ): Promise<ContainerInfo[]> {
    const containers = await listContainers(true);
    const search = partialName.toLowerCase();

    return containers.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(search);
      if (!nameMatch) return false;
      if (running === undefined) return true;
      return running ? c.state === 'running' : c.state !== 'running';
    });
  }

  async function startContainer(nameOrId: string): Promise<void> {
    const containers = await listContainers(true);
    const container = containers.find(
      (c) => c.name === nameOrId || c.id === nameOrId
    );

    if (!container) {
      throw new Error(`Container '${nameOrId}' not found`);
    }

    logger.info('Starting container', { name: container.name });
    await dockerRequest('POST', `/containers/${container.id}/start`);
  }

  async function stopContainer(nameOrId: string): Promise<void> {
    const containers = await listContainers(true);
    const container = containers.find(
      (c) => c.name === nameOrId || c.id === nameOrId
    );

    if (!container) {
      throw new Error(`Container '${nameOrId}' not found`);
    }

    logger.info('Stopping container', { name: container.name });
    await dockerRequest('POST', `/containers/${container.id}/stop`);
  }

  async function restartContainer(nameOrId: string): Promise<void> {
    const containers = await listContainers(true);
    const container = containers.find(
      (c) => c.name === nameOrId || c.id === nameOrId
    );

    if (!container) {
      throw new Error(`Container '${nameOrId}' not found`);
    }

    logger.info('Restarting container', { name: container.name });
    await dockerRequest('POST', `/containers/${container.id}/restart`);
  }

  function parseUptime(status: string): string {
    // "Up 2 days" -> "2d"
    // "Up 5 hours" -> "5h"
    // "Up 30 minutes" -> "30m"
    // "Up About an hour" -> "1h"
    // "Up About a minute" -> "1m"
    const match = status.match(/Up\s+(?:About\s+)?(?:an?\s+)?(\d+)?\s*(second|minute|hour|day|week|month)/i);
    if (!match) return '';

    const num = match[1] || '1';
    const unit = match[2].charAt(0).toLowerCase();
    return `${num}${unit}`;
  }

  function formatContainerList(containers: ContainerInfo[]): string {
    if (containers.length === 0) {
      return 'No containers found';
    }

    const running = containers.filter(c => c.state === 'running');
    const stopped = containers.filter(c => c.state !== 'running');

    const lines: string[] = [];

    if (running.length > 0) {
      const items = running.map(c => {
        const uptime = parseUptime(c.status);
        return uptime ? `${c.name} (${uptime})` : c.name;
      });
      lines.push(`🟢 Running (${running.length}):`);
      lines.push(items.join(', '));
    }

    if (stopped.length > 0) {
      if (lines.length > 0) lines.push('');
      const items = stopped.map(c => c.name);
      lines.push(`🔴 Stopped (${stopped.length}):`);
      lines.push(items.join(', '));
    }

    return lines.join('\n');
  }

  return {
    listContainers,
    findContainers,
    startContainer,
    stopContainer,
    restartContainer,
    formatContainerList,
  };
}

export type DockerService = ReturnType<typeof createDockerService>;
