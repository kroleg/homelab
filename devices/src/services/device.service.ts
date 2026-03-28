import type { Logger } from '../logger.ts';
import type { KeeneticService, Device as KeeneticDevice, PolicyInfo, TrafficInfo } from './keenetic.service.ts';
import type { UserRepository } from '../storage/user.repository.ts';
import type { DeviceRepository } from '../storage/device.repository.ts';
import type { TrafficRepository } from '../storage/traffic.repository.ts';
import type { User, Device, DeviceType, UserRole } from '../storage/db-schema.ts';

export interface EnrichedDevice extends Device {
  keeneticName: string | null;
  ip: string | null;
  online: boolean;
  policy: PolicyInfo | null;
  speedLimit: number | null;
  traffic: TrafficInfo | null;
}

export interface DiscoveredDevice {
  mac: string;
  name: string;
  ip: string | null;
  online: boolean;
  policy: PolicyInfo | null;
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
    speedLimits?: Record<string, number>,
  ): EnrichedDevice {
    const live = keeneticByMac.get(device.mac.toUpperCase());
    const traffic = todayByMac?.[device.mac.toLowerCase()] ?? null;
    return {
      ...device,
      keeneticName: live?.name ?? null,
      ip: live?.ip ?? null,
      online: live?.online ?? false,
      policy: live?.policy ?? null,
      speedLimit: speedLimits?.[device.mac.toLowerCase()] ?? null,
      traffic,
    };
  }

  const rolePriority: Record<string, number> = { parent: 1, child: 2, group: 3, guest: 4 };

  function sortUsers<T extends { isAdmin: boolean; role: string; name: string }>(users: T[]): T[] {
    return users.sort((a, b) => {
      // Admins first
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      // Then by role priority
      const ra = rolePriority[a.role] ?? 99;
      const rb = rolePriority[b.role] ?? 99;
      if (ra !== rb) return ra - rb;
      // Then by name
      return a.name.localeCompare(b.name);
    });
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
      let speedLimits: Record<string, number> | undefined;

      if (includeTraffic && allMacs.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const [weeklyRows, limits] = await Promise.all([
          trafficRepo.getDailyTotals(allMacs, 7),
          keenetic.getSpeedLimits(),
        ]);

        speedLimits = limits;
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
          const enriched = enrichDevice(device, keeneticByMac, todayByMac, speedLimits);
          const list = devicesByUserId.get(device.userId) || [];
          list.push(enriched);
          devicesByUserId.set(device.userId, list);
        }
      }

      return sortUsers(users).map(user => {
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
      const [dbDevices, keeneticByMac, speedLimits] = await Promise.all([
        deviceRepo.findByUserId(userId),
        getKeeneticDevicesMap(),
        keenetic.getSpeedLimits(),
      ]);

      const enriched = dbDevices.map(d => enrichDevice(d, keeneticByMac, undefined, speedLimits));
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

      return sortUsers(users).map(user => {
        const daily = userDailyMap.get(user.id) || {};
        const total = Object.values(daily).reduce((s, v) => s + v, 0);
        return { user, daily, total };
      });
    },

    async getTodayHourlyByUser(): Promise<Array<{
      user: User;
      devices: Array<{ mac: string; name: string; hourly: number[] }>;
      hourlyTotal: number[];
    }>> {
      const [users, dbDevices] = await Promise.all([
        userRepo.findAll(),
        deviceRepo.findAll(),
      ]);

      const allMacs = dbDevices.filter(d => d.userId).map(d => d.mac.toLowerCase());
      const hourlyRows = await trafficRepo.getTodayHourly(allMacs);

      const macToUserId = new Map<string, number>();
      const macToName = new Map<string, string>();
      for (const d of dbDevices) {
        if (d.userId) {
          macToUserId.set(d.mac.toLowerCase(), d.userId);
          macToName.set(d.mac.toLowerCase(), d.customName || d.mac);
        }
      }

      // Group: userId -> mac -> hour[] (24 slots)
      const userDeviceHourly = new Map<number, Map<string, number[]>>();
      for (const row of hourlyRows) {
        const userId = macToUserId.get(row.mac);
        if (!userId) continue;
        let deviceMap = userDeviceHourly.get(userId);
        if (!deviceMap) {
          deviceMap = new Map();
          userDeviceHourly.set(userId, deviceMap);
        }
        let hours = deviceMap.get(row.mac);
        if (!hours) {
          hours = new Array(24).fill(0);
          deviceMap.set(row.mac, hours);
        }
        hours[row.hour] = row.rx;
      }

      return sortUsers(users)
        .map(user => {
          const deviceMap = userDeviceHourly.get(user.id);
          if (!deviceMap) return { user, devices: [], hourlyTotal: new Array(24).fill(0) };

          const devices = Array.from(deviceMap.entries()).map(([mac, hourly]) => ({
            mac,
            name: macToName.get(mac) || mac,
            hourly,
          }));

          const hourlyTotal = new Array(24).fill(0);
          for (const d of devices) {
            for (let h = 0; h < 24; h++) hourlyTotal[h] += d.hourly[h];
          }

          return { user, devices, hourlyTotal };
        })
        .filter(u => u.hourlyTotal.some(v => v > 0));
    },

    async getAllUsers(): Promise<User[]> {
      return userRepo.findAll();
    },

    async createUser(data: { name: string; slug: string; isAdmin?: boolean; role?: UserRole }): Promise<User> {
      logger.info(`Creating user ${data.name} (${data.slug})`);
      return userRepo.create({
        name: data.name,
        slug: data.slug,
        isAdmin: data.isAdmin ?? false,
        role: data.role ?? 'parent',
      });
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
      data: { name?: string; slug?: string; isAdmin?: boolean; role?: UserRole }
    ): Promise<User | undefined> {
      logger.info(`Updating user ${userId}`, data);
      return userRepo.update(userId, data);
    },
  };
}

export type DeviceService = ReturnType<typeof createDeviceService>;
