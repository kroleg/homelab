# Experimental Mi TV Bluetooth test

Locally written investigation code; **not a working or production integration**. No downloaded GitHub code was executed. See [the case](../../mitv-home-assistant.md) for evidence, failed tests, and current status.

The server adapter registered the HID advertisement but neither the TV nor a nearby phone discovered it. Receive-only scans also found zero devices. User reports antennas may be missing/disconnected; this is a hypothesis awaiting physical verification. Pairing, key delivery, and standby wake remain untested.

`Dockerfile` installs BlueZ and Python D-Bus libraries from official Debian trixie packages. `remote.py` exports a minimal BLE consumer-control HID service, accepts pairing authorization only from the configured TV, and sends keys only on an explicit local D-Bus `Press` call. Pairing/discovery windows last five minutes. Keep the original TV remote paired.

## Reproduce after checking the antenna

The previous test container is stopped. Its state is in `/tmp/mitv-bluetooth-state`; the existing image is `homelab-mitv-bluetooth-test:trixie`. These temporary resources are not durable across cleanup/reboots.

If rebuilding, use this directory as context:

```sh
docker build -t homelab-mitv-bluetooth-test:trixie .
```

Start a separate BlueZ daemon with **private D-Bus**, host networking, NET_ADMIN/NET_RAW capabilities, a dedicated state directory mounted to `/var/lib/bluetooth`, and this directory mounted read-only to `/work`. Do not replace a running host BlueZ daemon or share its state directory. The container command used was:

```sh
mkdir -p /run/dbus && dbus-daemon --system --fork --nopidfile && exec /usr/libexec/bluetooth/bluetoothd --nodetach
```

First verify reception of a known nearby discoverable device. Only then start the test remote:

```sh
docker exec -d mitv-bluetooth-test sh -c 'python3 -u /work/remote.py > /tmp/remote.log 2>&1'
docker exec mitv-bluetooth-test cat /tmp/remote.log
```

The log prints its unique private D-Bus name for local control. Consumer usage `0x30` is Power, which is a toggle: do not send it blindly or automatically. No power command has been tested yet.

The adapter's classic class initially defaults to Computer; the investigation also tested `hciconfig hci0 class 0x000540` (keyboard), without improving discovery. This change does not persist in the script and has not been established as necessary.

Stop with `docker stop mitv-bluetooth-test`. No automatic restart or HA configuration was installed.
