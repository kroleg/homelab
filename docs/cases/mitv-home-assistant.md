# Mi TV control through Home Assistant

Last updated: 2026-11-01. Status: HDMI switching verified through the existing remote library; reliable wake method still open.

## Goal

Reliably turn the TV on and off, operate its remote functions, and select HDMI inputs from Home Assistant (HA). Investigate Bluetooth wake because the physical remote uses Bluetooth.

## Current conclusion

The existing Android TV Remote integration loses access after the TV turns off, preventing subsequent power-on (user report). Previous WoL and ping approaches were associated with unwanted wake-ups. Do not repeat those as new recommendations without addressing that history.

No Bluetooth wake implementation has been tested. HDMI 1 and HDMI 2 selection is verified by active TV input sessions using correctly encoded input URIs through the existing Android TV Remote library. No HA configuration or persistent TV settings were changed. TV left on the PS5 input after input tests.

## Environment and direct observations (2026-10-31)

- HA device name/model string: `MiTV-MSSP1`; manufacturer: Xiaomi. Exact retail model remains unknown.
- Integration: `androidtv_remote`.
- Entities: `media_player.mitv`, `remote.mitv`.
- Saved IP: `192.168.1.86`; saved MAC: `B4:C9:B9:98:91:46`.
- Sources: `home-assistant/.storage/core.config_entries`, `core.device_registry`, and `core.entity_registry` (read selectively; do not copy credentials).
- TCP connections to ports 6466 and 5555 succeeded. This establishes reachability at that moment only, not standby wake capability or authenticated ADB access.
- No `adb` executable was found on the host PATH.
- HA Compose image: `ghcr.io/home-assistant/home-assistant:2026.9`, host networking, `/run/dbus` mounted.
- Connection confirmed by ADB: Wi-Fi (`wlan0`, `192.168.1.86`). A `tun0` VPN interface is also present; its effect on control is not established.

## Earlier investigation (June 2026)

Evidence: user prompts recovered from `/home/kroleg/.claude/history.jsonl`, session `75ac4f66-fd8d-4eeb-8d8f-f72b3fa6ee98`. The full session JSONL is absent from the local Claude projects directory. Claude responses, tool output, and the pasted proposed solution could not be recovered. These prompts establish reported behavior and requests, not proof of every implementation change.

| Date | Attempt or observation | Result / confidence |
| --- | --- | --- |
| June 13 | Expose HA TV entity to Yandex Alice; requested YAML changes and restart | Requested; final configuration and outcome not recovered. |
| June 14 | Alice turns TV off, then cannot turn it back on | User-reported original failure. |
| June 14 | Power command overrides | User reported both on/off failing through Alice and questioned overriding turn-on, which had previously worked. Exact overrides unknown. |
| June 14 | WoL and standby settings | User: "wake on lan already enabled. no option mentioned in #1 present". Referenced option unknown. |
| June 14 | Alternative integration / web research | Requested; recommendations and results unavailable. |
| June 15 | Ping workaround | User: "disable this pingy thingy it randomly turns on tv". Treat as a regression; exact implementation unknown. |
| June 16 | Stop WoL | User: "also stop any wake on lan. seems like tv still randomly turns on". Execution not confirmed by retained history. |
| June 17 | Disable WoL on the TV and identify the wake source; use ADB | Requested; actual ADB commands, setting changes, and diagnosis unavailable. |

## Proposed options, not yet validated on this TV

- **Direct HDMI keys with existing integration:** in HA Developer Tools → Actions, try the example below while the TV is on. Other keys: `TV_INPUT_HDMI_2`, `TV_INPUT_HDMI_3`. Protocol support does not prove Xiaomi firmware implements them.

  ```yaml
  action: remote.send_command
  target:
    entity_id: remote.mitv
  data:
    command: TV_INPUT_HDMI_1
  ```

- **Input menu fallback:** `TV_INPUT`, then navigation keys. Requires observing the menu and determining a repeatable sequence.
- **ADB input control:** port 5555 is reachable, but authentication and actual device capabilities remain untested. Could inspect model, inputs, and power settings before choosing commands.
- **Bluetooth HID remote emulation:** requires a paired remote implementation, rather than an ordinary Bluetooth proxy. Wake from deep standby is unverified. No specific hardware or project chosen.
- **Infrared wake:** first establish whether this exact TV accepts IR power commands. The Bluetooth remote alone does not establish IR support. An IR transmitter would be needed.
- **HDMI-CEC wake:** investigate existing HDMI devices and TV CEC settings; requires a CEC-capable device/adapter and testing.
- **Network wake / quick-start settings:** already explored historically and associated with unwanted wakes. Revisit only as a controlled diagnosis with an explanation of what differs from the failed attempts.

## Next useful checks

1. Identify exact TV model, firmware, and connection type, preferably through read-only ADB inspection if authenticated access is available.
2. Inspect current wake settings and relevant existing HA automations; do not assume June's requested changes were completed.
3. Test HDMI keys and record each actual result.
4. Investigate a paired Bluetooth HID implementation and its standby wake behavior; separately establish IR/CEC availability.
5. If investigating random wake-ups, correlate TV power/wake logs with network and HA activity. Do not assume WoL magic packets were the sole cause.

## Claim audit and additional research (2026-10-31)

- Re-read the HA device/entity/config-entry records: saved identity, IP, MAC, integration, and entity names above still match. These are saved metadata, not a retail-model identification.
- Current config-entry options label `com.mediatek.wwtv.tvcenter` as `PS5`. This is an app label, not evidence that it selects the PS5's physical HDMI input. It suggests investigating MediaTek input IDs, but does not establish the chipset.
- No `androidtv`, `ping`, or `wake_on_lan` entries were found in the current config-entry registry. Neither `configuration.yaml` nor `automations.yaml` contains `ping` or `wake_on_lan`. This limited inspection does not rule out other hosts, TV firmware, or other configuration causing wakes.
- The only explicit `mitv` reference found in `automations.yaml` is the leak-warning TTS action targeting `media_player.mitv`. No conclusion about historical unwanted wakes follows from that alone.
- HA's container has `adb_shell` and `androidtv` Python libraries installed. A hand-written query using `adb_shell`, with no authentication keys, reached the TV but failed with `DeviceAuthError`. No shell command executed on the TV.
- Root cause of loss after standby remains a hypothesis: disappearance of network control is reported, but deep sleep versus firmware/service behavior has not been measured. Do not describe networking shutting down as an established fact.
- Direct HDMI key support is only protocol-level evidence. Other Xiaomi models reportedly ignore these keys while accepting TV-input app links. Treat direct-key examples above as tests, not working instructions.
- Previous WoL/ping regressions are established as historical user reports, not reproduced diagnoses. Exact current TV wake settings remain unknown.

### Additional candidates, not known to have been tried

| Candidate | Evidence and limits | Next check |
| --- | --- | --- |
| ESPHome paired BLE Mi remote | [shammysha/esphome-ble-mi-remote](https://github.com/shammysha/esphome-ble-mi-remote) describes pairing an ESP32 as a remote and exposing HA buttons. Source includes Power and wake-related actions. No compile/runtime test or full security review performed; current ESPHome compatibility and this TV's standby wake remain unknown. | Review a pinned revision and dependencies before any build; then test on suitable spare hardware. |
| Bluetooth pairing attempt as wake | [frlequ/mibox_socket](https://github.com/frlequ/mibox_socket) uses `bluetoothctl` scan/pair, not HID emulation. Author documents Mi Box/RPi4, not this TV. Source inspection shows no reliable success/state verification and no implemented turn-off. | Assess whether a single controlled pairing attempt is useful. Bluetooth MAC must be read independently; on this particular TV it matches the saved network MAC. Do not install the component blindly. |
| HDMI passthrough URI via existing remote | [EndLess728/MiTV-Remote](https://github.com/EndLess728/MiTV-Remote) reports input selection on MiTV-MOOR2 through app-link requests containing MediaTek passthrough input URIs. Different model, unverified here. | Read this TV's `dumpsys tv_input` and test the actual URI via `remote.turn_on` activity. Avoid guessed input IDs. |
| Vendor input activity via ADB | [cleanyourtv device notes](https://github.com/Gathin23/cleanyourtv/blob/main/docs/devices/xiaomi-mitv-mteq0-baymax.md) report `ExternalSourceActivity`, EXTSRC_PLAY and an integer input extra on a different Xiaomi firmware. | Confirm packages/activities exist on this TV before proposing an exact command. |
| MiLink network service | MiTV-Remote documents port 6091; HA's [xiaomi_tv integration](https://www.home-assistant.io/integrations/xiaomi_tv/) is restricted to MIUI TVs. Neither is a proven deep-standby wake solution for this device. | Identify firmware and relevant listening services before considering a different integration. |

### ADB installation and authorization

- User authorized direct ADB installation and requested caution with GitHub code. Treat repository code as research until reviewed; command approval alone does not establish code safety.
- `sudo -n apt-get install -y adb` failed because sudo requires a password. No system package installation completed.
- Downloaded Debian Bookworm packages using `apt-get download`: adb, android-libbase, android-libboringssl, android-libcutils, android-liblog. Extracted with `dpkg-deb -x` into `/tmp/mitv-adb/root`; no package maintainer scripts were run.
- Local binary reports ADB 1.0.41 / 29.0.6-debian. Invocation:

  ```sh
  env LD_LIBRARY_PATH=/tmp/mitv-adb/root/usr/lib/x86_64-linux-gnu/android \
      ANDROID_SDK_HOME=/tmp/mitv-adb \
      ADB_SERVER_SOCKET=tcp:localhost:5038 \
      /tmp/mitv-adb/root/usr/bin/adb devices -l
  ```

- A local ADB server was started on port 5038. Initial connection failed authentication. User then approved the RSA prompt on the TV, and subsequent direct ADB shell commands succeeded.

### Authorized ADB findings

- Model `MiTV-MSSP1`, device/board `nino`, platform `m7322`, Android 9, build fingerprint `Xiaomi/nino/nino:9/PI/5925:user/release-keys`. Retail name still not established.
- Vendor network wake settings: global `network_wol=0`, `network_wow=0`. Both currently disabled. Generic `wifi_wakeup_enabled=1` is also present, but must not be treated as proof that vendor WoL/WoW is enabled.
- Global `hdmi_control_enabled=1`, `hdmi_control_auto_wakeup_enabled=0`, `hdmi_control_auto_device_off_enabled=1`; HDMI service independently reports `mAutoWakeup: false`. CEC TV wake is therefore an untested option currently disabled.
- Other observed values (meaning not yet established on this firmware): `power_off_put_device_to_sleep=0`, `wifi_sleep_policy=0`, secure `sleep_timeout=1800000`. Do not change based on their names alone.
- Bluetooth address `B4:C9:B9:98:91:46` (matches the saved network MAC on this TV). Paired LE remote `Xiaomi RC`, address `18:46:44:B0:F2:8D`. `ro.boot.wake_up_rc` contains the same remote address: evidence of a vendor remote wake path, not proof arbitrary second HID devices can wake it.
- Power state was Awake / display ON. Retained system log shows power-button sleep at 21:59:46 and wake at 23:09:00 with reason `android.policy:POWER`. This does not identify the historical source of unwanted wakes.
- `pm list packages` matched MediaTek TV input services but did not match `milink`, `tvplayer`, or `livetv` package-name substrings. Live TV is hosted under `com.mediatek.wwtv.tvcenter`; class names do include `com.mitv.livetv`.
- CEC detects a powered-on PlayStation 5 at port 1 / physical address `0x1000`.

### Input mapping and first test

ADB `dumpsys tv_input` maps physical inputs as follows:

| Physical input | Android input ID |
| --- | --- |
| HDMI 1 | `com.mediatek.tvinput/.hdmi.HDMIInputService/HW2` |
| HDMI 2 | `com.mediatek.tvinput/.hdmi.HDMIInputService/HW3` |
| HDMI 3 | `com.mediatek.tvinput/.hdmi.HDMIInputService/HW4` |
| Composite | `com.mediatek.tvinput/.composite.CompositeInputService/HW1` |

- Resolving ACTION_VIEW for the plain HDMI 1 passthrough URI returned **No activity found**.
- Adding MIME type `vnd.android.cursor.item/channel` resolved to `com.mediatek.wwtv.tvcenter/com.mitv.livetv.nav.TurnkeyUiMainActivity`.
- Executed this reversible test using built-in Android commands, not downloaded code:

  ```sh
  adb -s 192.168.1.86:5555 shell am start -W \
    -a android.intent.action.VIEW \
    -t vnd.android.cursor.item/channel \
    -d content://android.media.tv/passthrough/com.mediatek.tvinput/.hdmi.HDMIInputService/HW2
  ```

- Launch returned `Status: ok`, resumed the Live TV activity, and created a main TV input session. This is not yet full proof the correct video appeared: visual confirmation and exact session target verification remain pending.
- Returned to preceding activity with `am start -W -n com.android.tv.settings/.MainSettings` (`Status: ok`).
- Asked user to confirm the PS5 appeared and whether now is suitable for standby/wake testing. No power test performed yet.
- Plain URI through HA's remote activity may fail on this firmware because of the required MIME type. ADB is a concrete fallback; test the actual HA launch behavior before choosing a permanent integration.

### First controlled standby test

- User authorized testing. At TV time 2026-10-31 23:53:12 MSK, confirmed Awake/display ON and sent Android `KEYCODE_SLEEP` (223). No wake settings changed. This dedicated sleep key may differ from the physical remote or Alice power path; compare those separately.
- Left the TV without diagnostic probes for 45 seconds after the initial command and library API inspection.
- A subsequent ADB power-state query timed out after 10 seconds.
- One Android TV Remote connection using HA's existing pairing files timed out after 8 seconds during TCP connection establishment. No key could be sent. This reproduces loss of both control paths after standby under current settings; it does not prove which Wi-Fi/firmware component suspends.
- User recovered the TV with the physical remote. ADB and Android TV Remote both reconnected successfully. Remote library reports service version `7.00.999235495`.
- Logs show sleep at 23:53:13 due to sleep button and wake at 23:54:58 with reason `android.policy:POWER`; no reboot occurred. No WoL, Bluetooth pairing, or CEC setting changes attempted.
- `persist.sys.wow=0` additionally confirms the observed disabled vendor wake configuration.

### Corrected and verified input method

The early unencoded URI tests were false positives: `am start` returned success but the active session remained the tuner (`HW5`). HDMI 1 key 243 also had no effect through either the paired Android remote protocol or ADB. Plain `TV_INPUT` through ADB brought focus to the launcher's Inputs control; pressing OK opened its panel.

Stock Inputs menu selection of PlayStation 5 created session `.../HDMI100004`. Replaying an unencoded URI still fell back to tuner. The crucial difference is encoding the **entire input ID as one URI path segment**, replacing its internal slashes with `%2F`. Android's [TV input framework documentation](https://source.android.com/docs/devices/tv) specifies `TvContract.buildChannelUriForPassthroughInput` for generating these links.

Verified via the installed, already-paired `androidtvremote2` library:

| Target | Activity URI | Observed active session |
| --- | --- | --- |
| HDMI 1 / PS5 | `content://android.media.tv/passthrough/com.mediatek.tvinput%2F.hdmi.HDMIInputService%2FHW2` | `.../HDMI100004` (CEC child on HDMI 1) |
| HDMI 2 | `content://android.media.tv/passthrough/com.mediatek.tvinput%2F.hdmi.HDMIInputService%2FHW3` | `.../HW3` |
| HDMI 3 | `content://android.media.tv/passthrough/com.mediatek.tvinput%2F.hdmi.HDMIInputService%2FHW4` | Mapped from framework; not yet tested. |

HA action using the same existing integration (exact UI action still to validate; library/protocol delivery verified):

```yaml
action: remote.turn_on
target:
  entity_id: remote.mitv
data:
  activity: content://android.media.tv/passthrough/com.mediatek.tvinput%2F.hdmi.HDMIInputService%2FHW2
```

This supersedes the earlier conclusion that MIME type is the key requirement: the encoded link worked over the remote protocol without an explicit MIME type. The remote must be reachable (TV awake).

### Server Bluetooth investigation

- User chose the server's Intel Bluetooth adapter instead of a spare ESP32.
- Kernel exposes `hci0`. `bluetoothctl` and `btmgmt` are absent from host PATH. `busctl --system tree org.bluez` reports no BlueZ service; `systemctl` confirms `bluetooth.service` does not exist.
- Existing Docker daemon is not rootless; HA container runs privileged with host networking. Investigating a temporary isolated BlueZ service using official distro packages. Do not modify the physical remote's bond or install unreviewed GitHub code.
- Built `homelab-mitv-bluetooth-test:local` from official `debian:bookworm-slim` and Debian packages `bluez`, `python3`, `python3-dbus`, `python3-gi`. No third-party GitHub code executed. Build context `/tmp/mitv-bluetooth-build`, pairing state `/tmp/mitv-bluetooth-state`.
- First daemon attempt on host D-Bus failed its ownership policy. Removed that stopped container and started `mitv-bluetooth-test` with private D-Bus inside the container instead; host bus policy unchanged. Uses host networking and NET_ADMIN/NET_RAW capabilities for the Bluetooth adapter. No restart policy installed.
- Adapter `DC:46:28:44:2D:97` supports central and peripheral roles, five advertising instances. BlueZ 5.66 active on the private bus. Unrelated optional audio plugin errors are present; GATT/advertising registered successfully.
- Locally written `/tmp/mitv-bluetooth-build/remote.py` exports a minimal BLE HID consumer-control service with battery/device information; accepts pairing authorization only from TV `B4:C9:B9:98:91:46`. No network listener, no automatic key sends, no impersonation/removal of original remote. Explicit local D-Bus method sends consumer key usages when subscribed.
- Advertising name **Homelab TV Remote**, appearance keyboard, HID service UUID 1812. GATT registration and advertising succeeded. Five-minute advertising and pairing window. Asked user to pair from TV Settings → Remotes & accessories → Add accessory. Pairing and wake results pending.
- Process command: `docker exec -d mitv-bluetooth-test sh -c 'python3 -u /work/remote.py > /tmp/remote.log 2>&1'`. Read logs with `docker exec mitv-bluetooth-test cat /tmp/remote.log`. Private D-Bus control identity is printed in the log; no well-known bus-name policy needed. Stop the test with `docker stop mitv-bluetooth-test` when finished (state remains under /tmp).
- First discovery attempt: user reports TV saw AirPods but not the test remote. Server still had one active advertisement, but adapter `Discoverable: no`. Updated local script to set adapter Discoverable=True and DiscoverableTimeout=300 before registering advertisement. Restarted the test; verified `Discoverable: yes`, `Pairable: yes`, one active advertisement. Asked user to reopen Add accessory. Actual RF visibility still needs confirmation.
- Container restart initially failed because the private D-Bus PID file survived. Recreated only this task's container with `dbus-daemon --system --fork --nopidfile`. Pairing state directory preserved. Use `--nopidfile` for future recreation; no host D-Bus configuration changed.
- Discovery retry also failed. User reports phone standing next to server cannot see the test remote but can see `MiTV-MSSP1`. This makes distance a less likely sole cause; ordinary phone settings may still filter BLE devices, so it is not a full over-the-air packet capture.
- Local HCI capture `/tmp/advertising.btsnoop` (inside test container) confirms controller accepted connectable undirected advertising, discoverable flag, HID UUID 1812, keyboard appearance, scan-response name `Homelab TV Remote`, all three advertising channels, interval 1280 ms. Controller success is not proof the phone/TV receives the RF transmission.
- Adapter initially advertised classic device class Desktop workstation (`0x000104`). Set it to keyboard (`hciconfig hci0 class 0x000540`) and set adapter Alias to `Homelab TV Remote`. Verified class and local controller name. TV still reported zero visible devices; no bond established.
- One 12-second server discovery attempt with TV MAC filter did not find the TV. rfkill state: soft=0, hard=0 (unblocked). USB identity `8087:0a2a`, driver btusb, HCI/LMP 4.2, Intel manufacturer. No hardware failure conclusion yet.
- Read access to host kernel journal is restricted, so firmware initialization messages were not obtained.
- Power-cycling the test adapter through BlueZ 5.66 triggered daemon crash (container exit 139, not OOM): `btd_adv_monitor_power_down()` reported unexpected NULL manager, followed by a D-Bus assertion. Home Assistant and other services remained running. Test remote is down until rebuilt/restarted.
- Preserved reset capture and remote log under `/tmp/mitv-bluetooth-build/`. Building a second image from official Debian trixie packages to check whether behavior is specific to BlueZ 5.66. Do not treat advertising registration or a discoverable flag as a successful discovery test.
- Debian trixie image built with BlueZ 5.82. GATT/advertisement registration succeeded, but both mixed discovery and receive-only discovery (remote advertising stopped) still found zero devices. HCI capture confirms successful LE active-scan enable and classic inquiry, with no discovery results. Startup UUID/advertising-monitor errors persisted. Upgrading BlueZ alone did not resolve discovery.
- Intel vendor version read returned hardware platform 0x37, variant 0x08, firmware patch 0x43. Matching `ibt-hw-37.8...` firmware files exist. [Kernel structure definition](https://raw.githubusercontent.com/torvalds/linux/v6.1/drivers/bluetooth/btintel.h) and [BlueZ hardware variants](https://kernel.googlesource.com/pub/scm/bluetooth/bluez.git/+/refs/tags/5.64/doc/intel-variants.txt) support interpretation. Do not claim firmware is missing.
- Reloaded only USB Bluetooth interface `1-8:1.0` by unbinding/rebinding `btusb`, with test daemon stopped. Kernel logged successful detection and `Intel device is already patched. patch num: 43`. Subsequent receive-only scan still found zero devices. Server, Wi-Fi, HA, TV, and original remote were not restarted.
- User reports server antennas **might be missing/disconnected**. This could explain transmit and receive failure, but is not confirmed. Next check is antenna connectivity and basic reception of a known nearby discoverable device; do not keep retrying TV pairing until basic radio functionality works.
- User explicitly deferred Ethernet testing; keep it out of the current experiment.
- Stopped `mitv-bluetooth-test` while awaiting antenna inspection. No test remote is currently advertising. Saved reproducible source and limits under [support/mitv-bluetooth-test](support/mitv-bluetooth-test/README.md). No permanent host Bluetooth service or HA integration/configuration was installed.

### Remaining verification

### Alice HDMI selection and voice navigation

- Existing bridge verified: Yandex Smart Home / Yaha Cloud custom integration **1.1.3**. `media_player.mitv` is already included in its UI-configured filter. TV control transport is `androidtv_remote`, while the Yandex integration exposes its capabilities to Alice. No new TV pairing/integration is required.
- Prepared [configuration example](support/mitv-alice.yaml), **not applied to live configuration**. Its Yandex entity configuration and seven navigation action sequences pass the installed schemas using a temporary in-memory HA context. Earlier standalone validation attempts lacked the HA template-validation context; the final validation passed. No TV commands were sent by validation.
- HDMI selection: add a custom `input_source` capability to existing `media_player.mitv`; map Yandex `one/two/three` to `HW2/HW3/HW4`, then call `remote.turn_on` on `remote.mitv` with the correctly encoded URI. No power on/off overrides are needed. Current input state is not reported because no reliable input sensor exists.
- Merge the example's `yandex_smart_home` section into `configuration.yaml`, then reload Yandex Smart Home YAML from HA Developer Tools → YAML and refresh devices in the Alice app. [Integration configuration docs](https://docs.yaha-cloud.ru/v1.1.x/config/getting-started/) support mixing UI filtering with YAML entity configuration.
- [Custom mode docs](https://docs.yaha-cloud.ru/v1.1.x/advanced/capabilities/mode/) define `mode` as the mapped HA value passed to `set_mode`. [Yandex voice examples](https://yandex.ru/dev/dialogs/smart-home/doc/ru/concepts/mode-instance#input_source): "Алиса, включи первый источник сигнала телевизора", "Алиса, смени вход телека на второй".
- Navigation: example scripts `mitv_up/down/left/right/ok/back/home` send `DPAD_UP/DOWN/LEFT/RIGHT/CENTER`, `BACK`, `HOME` through existing `remote.mitv`. Load these as HA scripts, then explicitly expose the scripts in Yandex Smart Home (current filter includes only existing devices, not new scripts). Scripts are supported as stateless on-actions by the installed Yandex integration.
- In Alice, create voice scenarios such as "телевизор вправо" → turn on script "ТВ вправо", and "подтверди на телевизоре" → turn on "ТВ подтвердить". Exact speech recognition and end-to-end Alice execution remain untested. Standard Alice TV input capabilities do not expose generic DPAD buttons; scenarios provide custom trigger phrases. Each voice command incurs cloud/recognition delay.
- Still requires the TV to be awake/reachable. This does not solve standby power-on. Alice source selectors and scenario phrases have not yet been tested end-to-end.

Confirm HDMI video and test other ports, then establish a repeatable HA action. For power: controlled standby test with timestamps, physical remote available for recovery, and checks after short and extended standby. Avoid continuous probes because prior ping activity was associated with wakes. Bluetooth wake needs an independently tested implementation; CEC wake is disabled and remains another option. Random wake behavior requires observation over time, not a single successful power-on.

## References

- [HA Android TV Remote](https://www.home-assistant.io/integrations/androidtv_remote/)
- [HA 2026.9 remote implementation](https://raw.githubusercontent.com/home-assistant/core/2026.9.0/homeassistant/components/androidtv_remote/remote.py): turn-on sends a network POWER command; it is not an independent Bluetooth wake mechanism.
- [Remote protocol key definitions](https://raw.githubusercontent.com/tronikos/androidtvremote2/main/src/androidtvremote2/remotemessage.proto): includes direct HDMI input keys and TV_INPUT.
- [HA Android Debug Bridge](https://www.home-assistant.io/integrations/androidtv/)
- [HA Wake on LAN](https://www.home-assistant.io/integrations/wake_on_lan/)
- [HA HDMI-CEC](https://www.home-assistant.io/integrations/hdmi_cec/)
- [HA Broadlink / IR commands](https://www.home-assistant.io/integrations/broadlink/)
- [ESPHome Bluetooth proxy](https://esphome.io/components/bluetooth_proxy/)
