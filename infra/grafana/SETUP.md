# Grafana Setup

## Power Monitoring (Intel RAPL)

To enable CPU power monitoring, create `/etc/systemd/system/rapl-permissions.service`:

```ini
[Unit]
Description=Set RAPL permissions for power monitoring
After=local-fs.target

[Service]
Type=oneshot
ExecStart=/bin/chmod a+r /sys/devices/virtual/powercap/intel-rapl/intel-rapl:0/energy_uj
ExecStart=/bin/sh -c 'chmod a+r /sys/devices/virtual/powercap/intel-rapl/intel-rapl:0/intel-rapl:0:*/energy_uj'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

Then enable:
```bash
sudo systemctl enable --now rapl-permissions.service
```
