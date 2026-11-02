FROM debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3
RUN apt-get update \
    && apt-get install -y --no-install-recommends dante-server \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 1080 --no-create-home proxyout
ENTRYPOINT ["/usr/sbin/danted"]
CMD ["-f", "/etc/danted.conf"]
