"""Local BLE HID experiment. Written for this investigation; no downloaded code.

Exposes a consumer-control remote, accepts pairing only from the known TV,
and sends keys only on an explicit local D-Bus Press call. No network listener.
"""
import signal
import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

BLUEZ = 'org.bluez'
PROPS = 'org.freedesktop.DBus.Properties'
MANAGER = 'org.freedesktop.DBus.ObjectManager'
SERVICE = 'org.bluez.GattService1'
CHAR = 'org.bluez.GattCharacteristic1'
DESC = 'org.bluez.GattDescriptor1'
ROOT = '/org/homelab/mitv'
TV_SUFFIX = '/dev_B4_C9_B9_98_91_46'


def uuid(short):
    return f'0000{short}-0000-1000-8000-00805f9b34fb'


def octets(values):
    return dbus.Array([dbus.Byte(x) for x in values], signature='y')


class Obj(dbus.service.Object):
    def __init__(self, path, iface, properties):
        super().__init__(bus, path)
        self.path, self.iface, self.props = path, iface, properties

    @dbus.service.method(PROPS, in_signature='s', out_signature='a{sv}')
    def GetAll(self, interface):
        if interface != self.iface:
            raise dbus.exceptions.DBusException('Unknown interface')
        return self.props

    @dbus.service.method(PROPS, in_signature='ss', out_signature='v')
    def Get(self, interface, name):
        return self.GetAll(interface)[name]

    @dbus.service.signal(PROPS, signature='sa{sv}as')
    def PropertiesChanged(self, interface, changed, invalidated):
        pass


objects = []


def service(number, short):
    obj = Obj(f'{ROOT}/service{number}', SERVICE,
              {'UUID': uuid(short), 'Primary': dbus.Boolean(True),
               'Includes': dbus.Array([], signature='o')})
    objects.append(obj)
    return obj


class Characteristic(Obj):
    def __init__(self, parent, number, short, flags, value):
        super().__init__(f'{parent.path}/char{number}', CHAR,
                         {'Service': dbus.ObjectPath(parent.path),
                          'UUID': uuid(short), 'Flags': dbus.Array(flags, signature='s'),
                          'Notifying': dbus.Boolean(False), 'Value': octets(value)})
        self.value = bytes(value)
        objects.append(self)

    @dbus.service.method(CHAR, in_signature='a{sv}', out_signature='ay')
    def ReadValue(self, options):
        return octets(self.value[int(options.get('offset', 0)):])

    @dbus.service.method(CHAR, in_signature='aya{sv}', out_signature='')
    def WriteValue(self, value, options):
        print('WRITE', self.path, bytes(value).hex(), flush=True)
        self.value = bytes(value)

    @dbus.service.method(CHAR, in_signature='', out_signature='')
    def StartNotify(self):
        self.props['Notifying'] = dbus.Boolean(True)
        self.PropertiesChanged(CHAR, {'Notifying': dbus.Boolean(True)}, [])
        print('NOTIFY_ON', self.path, flush=True)

    @dbus.service.method(CHAR, in_signature='', out_signature='')
    def StopNotify(self):
        self.props['Notifying'] = dbus.Boolean(False)
        self.PropertiesChanged(CHAR, {'Notifying': dbus.Boolean(False)}, [])
        print('NOTIFY_OFF', self.path, flush=True)

    def emit(self, value):
        self.value = bytes(value)
        self.props['Value'] = octets(value)
        self.PropertiesChanged(CHAR, {'Value': octets(value)}, [])


class Descriptor(Obj):
    def __init__(self, parent):
        super().__init__(parent.path + '/desc0', DESC,
                         {'Characteristic': dbus.ObjectPath(parent.path),
                          'UUID': uuid('2908'),
                          'Flags': dbus.Array(['read'], signature='s')})
        objects.append(self)

    @dbus.service.method(DESC, in_signature='a{sv}', out_signature='ay')
    def ReadValue(self, options):
        return octets([1, 1])  # Report ID 1, Input report.


class Application(dbus.service.Object):
    @dbus.service.method(MANAGER, out_signature='a{oa{sa{sv}}}')
    def GetManagedObjects(self):
        return {dbus.ObjectPath(o.path): {o.iface: o.props} for o in objects}

    @dbus.service.method('org.homelab.MiTVRemote', in_signature='q', out_signature='s')
    def Press(self, usage):
        if not report.props['Notifying']:
            return 'Not connected/subscribed; no key sent'
        if not 0 < usage <= 0x3ff:
            return 'Unsupported consumer usage'
        report.emit([usage & 255, usage >> 8])
        GLib.timeout_add(120, lambda: (report.emit([0, 0]), False)[1])
        print('PRESS', hex(usage), flush=True)
        return 'Sent consumer usage ' + hex(usage)


class Agent(dbus.service.Object):
    def check(self, device):
        if not str(device).endswith(TV_SUFFIX):
            e = dbus.exceptions.DBusException('Only the configured TV may pair')
            e._dbus_error_name = 'org.bluez.Error.Rejected'
            raise e

    @dbus.service.method('org.bluez.Agent1')
    def Release(self):
        pass

    @dbus.service.method('org.bluez.Agent1', in_signature='o')
    def RequestAuthorization(self, device):
        self.check(device)
        print('PAIR_AUTHORIZED', device, flush=True)

    @dbus.service.method('org.bluez.Agent1', in_signature='ou')
    def RequestConfirmation(self, device, passkey):
        self.check(device)
        print('PAIR_CONFIRMED', device, flush=True)

    @dbus.service.method('org.bluez.Agent1', in_signature='os')
    def AuthorizeService(self, device, service_uuid):
        self.check(device)

    @dbus.service.method('org.bluez.Agent1')
    def Cancel(self):
        print('PAIR_CANCELLED', flush=True)


class Advertisement(Obj):
    def __init__(self):
        super().__init__(ROOT + '/advertisement', 'org.bluez.LEAdvertisement1',
                         {'Type': 'peripheral',
                          'ServiceUUIDs': dbus.Array([uuid('1812')], signature='s'),
                          'LocalName': 'Homelab TV Remote',
                          'Appearance': dbus.UInt16(0x03c1),
                          'Timeout': dbus.UInt16(300)})

    @dbus.service.method('org.bluez.LEAdvertisement1')
    def Release(self):
        print('ADVERTISING_STOPPED', flush=True)


DBusGMainLoop(set_as_default=True)
bus = dbus.SystemBus()
print('CONTROL_BUS', bus.get_unique_name(), flush=True)
app = Application(bus, ROOT)
hid = service(0, '1812')
Characteristic(hid, 0, '2a4a', ['read'], [0x11, 0x01, 0, 3])
# Consumer control, report 1, one 16-bit usage in range 0..1023.
Characteristic(hid, 1, '2a4b', ['read', 'encrypt-read'],
               bytes.fromhex('050c0901a1018501150026ff0319002aff03751095018100c0'))
Characteristic(hid, 2, '2a4c', ['write-without-response'], [0])
Characteristic(hid, 3, '2a4e', ['read', 'write-without-response'], [1])
report = Characteristic(hid, 4, '2a4d', ['read', 'notify', 'encrypt-read'], [0, 0])
Descriptor(report)
battery = service(1, '180f')
Characteristic(battery, 0, '2a19', ['read', 'notify'], [100])
info = service(2, '180a')
Characteristic(info, 0, '2a29', ['read'], b'Homelab')
Characteristic(info, 1, '2a50', ['read'], [2, 0x6b, 0x1d, 0x46, 2, 0, 1])
agent = Agent(bus, ROOT + '/agent')
agents = dbus.Interface(bus.get_object(BLUEZ, '/org/bluez'), 'org.bluez.AgentManager1')
agents.RegisterAgent(ROOT + '/agent', 'NoInputNoOutput')
agents.RequestDefaultAgent(ROOT + '/agent')
adapter = bus.get_object(BLUEZ, '/org/bluez/hci0')
properties = dbus.Interface(adapter, PROPS)
properties.Set('org.bluez.Adapter1', 'Powered', dbus.Boolean(True))
properties.Set('org.bluez.Adapter1', 'Alias', dbus.String('Homelab TV Remote'))
properties.Set('org.bluez.Adapter1', 'PairableTimeout', dbus.UInt32(300))
properties.Set('org.bluez.Adapter1', 'Pairable', dbus.Boolean(True))
properties.Set('org.bluez.Adapter1', 'DiscoverableTimeout', dbus.UInt32(300))
properties.Set('org.bluez.Adapter1', 'Discoverable', dbus.Boolean(True))
advertisement = Advertisement()
loop = GLib.MainLoop()


def failed(error):
    print('REGISTRATION_FAILED', error, flush=True)
    loop.quit()


def registered():
    print('GATT_REGISTERED', flush=True)
    dbus.Interface(adapter, 'org.bluez.LEAdvertisingManager1').RegisterAdvertisement(
        advertisement.path, {},
        reply_handler=lambda: print('READY: Homelab TV Remote; pairing window 300 seconds', flush=True),
        error_handler=failed)


def device_changed(interface, changed, invalidated, path=None):
    if interface == 'org.bluez.Device1' and str(path).endswith(TV_SUFFIX):
        print('TV_STATE', dict(changed), flush=True)


bus.add_signal_receiver(device_changed, dbus_interface=PROPS,
                        signal_name='PropertiesChanged', path_keyword='path')
dbus.Interface(adapter, 'org.bluez.GattManager1').RegisterApplication(
    ROOT, {}, reply_handler=registered, error_handler=failed)
signal.signal(signal.SIGTERM, lambda *_: loop.quit())
signal.signal(signal.SIGINT, lambda *_: loop.quit())
loop.run()
