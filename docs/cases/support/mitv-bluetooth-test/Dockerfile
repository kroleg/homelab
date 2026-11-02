FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends bluez python3 python3-dbus python3-gi && rm -rf /var/lib/apt/lists/*
CMD ["/usr/libexec/bluetooth/bluetoothd", "--nodetach"]
