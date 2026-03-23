import type { Logger } from '../logger.ts';
import type { KeeneticService, Device as KeeneticDevice, TrafficInfo } from './keenetic.service.ts';
import type { UserRepository } from '../storage/user.repository.ts';
import type { DeviceRepository } from '../storage/device.repository.ts';
import type { TrafficRepository } from '../storage/traffic.repository.ts';
import type { User, Device, DeviceType } from '../storage/db-schema.ts';

export interface EnrichedDevice extends Device {
  keeneticName: string | null;
  ip: string | null;
  online: boolean;
  policy: string | null;
  traffic: TrafficInfo | null;
}

export interface DiscoveredDevice {
  mac: string;
  name: string;
  ip: string | null;
  online: boolean;
  policy: string | null;
}

export interface UserWithDevices extends User {
  devices: EnrichedDevice[];
  onlineCount: number;
  totalTraffic: number;
  weeklyTraffic: number;
}

export function createDeviceService(
  keenetic: KeeneticService,
  userRepo: UserRepository,
  deviceRepo: DeviceRepository,
  trafficRepo: TrafficRepository,
  logger: Logger
) {
  async function getKeeneticDevicesMap(): Promise<Map<string, KeeneticDevice>> {
    const keeneticDevices = await keenetic.getClients();
    return new Map(keeneticDevices.map(d => [d.mac.toUpperCase(), d]));
  }

  function enrichDevice(
    device: Device,
    keeneticByMac: Map<string, KeeneticDevice>,
    todayByMac?: Record<string, TrafficInfo>,
  ): EnrichedDevice {
    const live = keeneticByMac.get(device.mac.toUpperCase());
    const traffic = todayByMac?.[device.mac.toLowerCase()] ?? null;
    return {
      ...device,
      keeneticName: live?.name ?? null,
      ip: live?.ip ?? null,
      online: live?.online ?? false,
      policy: live?.policy ?? null,
      traffic,
    };
  }

  function sortByOnlineThenName(devices: EnrichedDevice[]): EnrichedDevice[] {
    return devices.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      const nameA = a.customName || a.keeneticName || a.mac;
      const nameB = b.customName || b.keeneticName || b.mac;
      return nameA.localeCompare(nameB);
    });
  }

  return {
    async getUsersWithDevices(includeTraffic = false): Promise<UserWithDevices[]> {
      const [users, dbDevices, keeneticByMac] = await Promise.all([
        userRepo.findAll(),
        deviceRepo.findAll(),
        getKeeneticDevicesMap(),
      ]);

      const allMacs = dbDevices.filter(d => d.userId).map(d => d.mac.toLowerCase());
      let todayByMac: Record<string, TrafficInfo> | undefined;
      let weeklyByMac: Map<string, number> | undefined;

      if (includeTraffic && allMacs.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const weeklyRows = await trafficRepo.getDailyTotals(allMacs, 7);

        todayByMac = {};
        weeklyByMac = new Map<string, number>();
        for (const row of weeklyRows) {
          const mac = row.mac.toLowerCase();
          weeklyByMac.set(mac, (weeklyByMac.get(mac) || 0) + row.rx);
          if (row.date === today) {
            const prev = todayByMac[mac]?.total || 0;
            const rx = prev + row.rx;
            todayByMac[mac] = { rx, tx: 0, total: rx };
          }
        }
      }

      const devicesByUserId = new Map<number, EnrichedDevice[]>();
      for (const device of dbDevices) {
        if (device.userId) {
          const enriched = enrichDevice(device, keeneticByMac, todayByMac);
          const list = devicesByUserId.get(device.userId) || [];
          list.push(enriched);
          devicesByUserId.set(device.userId, list);
        }
      }

      return users.map(user => {
        const devices = sortByOnlineThenName(devicesByUserId.get(user.id) || []);
        const onlineCount = devices.filter(d => d.online).length;
        const totalTraffic = devices.reduce((sum, d) => sum + (d.traffic?.total ?? 0), 0);
        const weeklyTraffic = devices.reduce((sum, d) => {
          return sum + (weeklyByMac?.get(d.mac.toLowerCase()) || 0);
        }, 0);
        return { ...user, devices, onlineCount, totalTraffic, weeklyTraffic };
      });
    },

    async getUnassignedDevices(): Promise<EnrichedDevice[]> {
      const [dbDevices, keeneticByMac] = await Promise.all([
        deviceRepo.findUnassigned(),
        getKeeneticDevicesMap(),
      ]);

      const enriched = dbDevices.map(d => enrichDevice(d, keeneticByMac));
      return sortByOnlineThenName(enriched);
    },

    async getUserDevices(userId: number): Promise<EnrichedDevice[]> {
      const [dbDevices, keeneticByMac] = await Promise.all([
        deviceRepo.findByUserId(userId),
        getKeeneticDevicesMap(),
      ]);

      const enriched = dbDevices.map(d => enrichDevice(d, keeneticByMac));
      return sortByOnlineThenName(enriched);
    },

    async getUnregisteredDevices(): Promise<DiscoveredDevice[]> {
      const [dbDevices, keeneticDevices] = await Promise.all([
        deviceRepo.findAll(),
        keenetic.getClients(),
      ]);

      const registeredMacs = new Set(dbDevices.map(d => d.mac.toUpperCase()));

      return keeneticDevices
        .filter(d => !registeredMacs.has(d.mac.toUpperCase()))
        .sort((a, b) => {
          if (a.online !== b.online) return a.online ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map(d => ({
          mac: d.mac,
          name: d.name,
          ip: d.ip,
          online: d.online,
          policy: d.policy,
        }));
    },

    async registerDevice(
      mac: string,
      userId: number | null,
      deviceType: DeviceType,
      customName?: string
    ): Promise<Device> {
      logger.info(`Registering device ${mac} to user ${userId}`);
      return deviceRepo.create({
        mac: mac.toUpperCase(),
        userId,
        deviceType,
        customName: customName || null,
      });
    },

    async changeOwner(deviceId: number, userId: number | null): Promise<Device | undefined> {
      logger.info(`Changing device ${deviceId} owner to ${userId}`);
      return deviceRepo.updateOwner(deviceId, userId);
    },

    async updateDeviceType(deviceId: number, deviceType: DeviceType): Promise<Device | undefined> {
      logger.info(`Updating device ${deviceId} type to ${deviceType}`);
      return deviceRepo.updateType(deviceId, deviceType);
    },

    async updateDevice(
      deviceId: number,
      data: { customName?: string | null; deviceType?: DeviceType; userId?: number | null; tailscaleIp?: string | null }
    ): Promise<Device | undefined> {
      logger.info(`Updating device ${deviceId}`, data);
      return deviceRepo.update(deviceId, data);
    },

    async getWeeklyTrafficByUser(): Promise<Array<{
      user: User;
      daily: Record<string, number>;
      total: number;
    }>> {
      const [users, dbDevices] = await Promise.all([
        userRepo.findAll(),
        deviceRepo.findAll(),
      ]);

      const allMacs = dbDevices.filter(d => d.userId).map(d => d.mac.toLowerCase());
      const weeklyRows = allMacs.length > 0
        ? await trafficRepo.getDailyTotals(allMacs, 7)
        : [];

      // Map mac -> userId
      const macToUserId = new Map<string, number>();
      for (const d of dbDevices) {
        if (d.userId) macToUserId.set(d.mac.toLowerCase(), d.userId);
      }

      // Aggregate by userId + date
      const userDailyMap = new Map<number, Record<string, number>>();
      for (const row of weeklyRows) {
        const userId = macToUserId.get(row.mac.toLowerCase());
        if (!userId) continue;
        const daily = userDailyMap.get(userId) || {};
        daily[row.date] = (daily[row.date] || 0) + row.rx;
        userDailyMap.set(userId, daily);
      }

      return users.map(user => {
        const daily = userDailyMap.get(user.id) || {};
        const total = Object.values(daily).reduce((s, v) => s + v, 0);
        return { user, daily, total };
      }).sort((a, b) => b.total - a.total);
    },

    async getAllUsers(): Promise<User[]> {
      return userRepo.findAll();
    },

    async createUser(name: string, slug: string, isAdmin: boolean = false): Promise<User> {
      logger.info(`Creating user ${name} (${slug})`);
      return userRepo.create({ name, slug, isAdmin });
    },

    async deleteUser(userId: number): Promise<void> {
      logger.info(`Deleting user ${userId}`);
      await userRepo.delete(userId);
    },

    async toggleAdmin(userId: number): Promise<User | undefined> {
      const user = await userRepo.findById(userId);
      if (!user) return undefined;
      logger.info(`Toggling admin for user ${userId} to ${!user.isAdmin}`);
      return userRepo.update(userId, { isAdmin: !user.isAdmin });
    },

    async updateUser(
      userId: number,
      data: { name?: string; slug?: string; isAdmin?: boolean }
    ): Promise<User | undefined> {
      logger.info(`Updating user ${userId}`, data);
      return userRepo.update(userId, data);
    },
  };
}

export type DeviceService = ReturnType<typeof createDeviceService>;
