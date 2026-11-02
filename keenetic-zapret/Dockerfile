FROM debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3 AS build
ARG ZAPRET_COMMIT=f924d796b49da9e455c6bb09268298ef1471cd74
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gcc make pkg-config libcap-dev libluajit-5.1-dev libnetfilter-queue-dev libnfnetlink-dev libmnl-dev zlib1g-dev && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL --retry 3 https://codeload.github.com/bol-van/zapret2/tar.gz/${ZAPRET_COMMIT} -o /source.tar.gz \
    && echo '37b6c71ae5249345b6ba762efe47ef6a9a7391321d1c80306775ca795e3c0d79  /source.tar.gz' | sha256sum -c - \
    && mkdir /source && tar -xzf /source.tar.gz -C /source --strip-components=1 \
    && make -C /source/nfq2 -j2

FROM debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3
RUN apt-get update && apt-get install -y --no-install-recommends nftables iproute2 python3 libluajit-5.1-2 libnetfilter-queue1 libnfnetlink0 libmnl0 zlib1g \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /source/nfq2/nfqws2 /usr/local/bin/nfqws2
COPY --from=build /source/lua/zapret-lib.lua /source/lua/zapret-antidpi.lua /opt/zapret2/lua/
COPY controller.py /usr/local/bin/controller.py
WORKDIR /opt/zapret2
ENTRYPOINT ["python3", "-u", "/usr/local/bin/controller.py"]
