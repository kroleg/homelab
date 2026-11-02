# Stage-two source review, 2026-11-01

Upstream: https://github.com/bol-van/zapret2, commit `f924d796b49da9e455c6bb09268298ef1471cd74`.
Source archive SHA256: `37b6c71ae5249345b6ba762efe47ef6a9a7391321d1c80306775ca795e3c0d79`.
The checksum pins the retrieved content; it is not independent author authentication.

## Scope and findings

Static security-pattern scans covered the downloaded engine, Lua and common source trees (92 files; approximately 32,197 lines in C/headers/crypto/Lua counted). Manual review concentrated on every matched execution/network/file/privilege entry point, the Linux build recipe and startup path, Lua loading/sandbox, NFQUEUE verdict handling and packet generation, plus the complete new Dockerfile, controller, Compose configuration and initial strategy file. This is not a claim of a full line-by-line correctness audit, proof of no malicious behavior, or dependency/compiler audit.

No evidence of unexpected persistence, credential collection, telemetry endpoints, or remote command fetching was found in the reviewed paths. Raw sockets, packet replacement, configurable local file I/O and Lua execution are intended engine features. Lua `luaexec` can execute configured code, so this integration rejects that strategy and extra Lua initialization arguments. The upstream Linux startup drops UID/GID and capabilities, installs a seccomp filter, and removes os.execute/io.popen/package.loadlib before Lua initialization. LuaJIT and native packet parsing remain attack surfaces; no untrusted scripts are mounted. Only the two pinned Lua modules are copied into the image.

Relevant upstream source: nfq2/Makefile; nfq2/nfqws.c (Linux NFQUEUE startup, CLI and file access); nfq2/sec.c (setuid/capabilities/seccomp); nfq2/lua.c (Lua library loading and hardening); nfq2/darkmagic.c (route lookup and raw sends); helpers/hostlist/ipset/params file I/O; lua/zapret-lib.lua and lua/zapret-antidpi.lua. Address/URL scans found documentation references and packet-processing examples, not an unrelated fixed callback destination. Optional upstream install/discovery scripts are not used or executed.

The container receives no host filesystem, Docker socket, credentials, user home, or host network namespace. It shares only the proxy network namespace and has NET_ADMIN/NET_RAW, UID/GID/capability-drop support, and KILL to terminate its own privilege-dropped engine child. Configuration mounts are read-only. The controller uses argument arrays, not a shell; strategies are allowlisted. The sole removable nftables table requires an ownership comment. Queue scope is proxy UID 1080 / IPv4 / public destinations / TCP 443; reply scope uses only the tagged connections. Engine-generated marked packets are excluded and untracked. No TLS interception is configured.

Base image is digest-pinned. Engine archive is commit- and checksum-pinned; Lua hashes are listed below. Debian packages are installed through signed Debian repositories; their full source/maintainer scripts and the compiler trust chain have not been independently audited. Automatic pip/yt-dlp installation was removed; any later test tool must be inspected before execution. Signed URLs, cookies and credentials must not appear in retained test logs.

- zapret-lib.lua SHA256: `6bf528fef1f0fc3c65e189216fc8a06bb873f6e25d1c29d2bfa4695a09b73440`
- zapret-antidpi.lua SHA256: `6d1fa9168e5de1682fef91fd174f68b58c50f6739ef00f42ca7db2b940b6246d`

## Execution timeline

Before the user's audit request: only the proxy UID image update completed; stage-two build was installing Debian dependencies. The build was interrupted with exit 130. No nfqws2 container/image or interception rules had been created. The old proxy container continued running; its config was returned to nobody until the audited replacement is deployed. Source review occurred before resuming compilation or running the engine. Future strategies and diagnostic scripts require review before execution.

## Production refactor review — 2026-11-02

Re-reviewed the complete simplified controller, both Dockerfiles, Compose service definitions, Dante ACL and the single engine.args before rebuilding/redeployment. Removed disposable probes, candidate/duplicate strategy files, runtime curl/CA packages, the proxy-local diagnostic ACL and optional hostname-filter argument support. Only reviewed fake/multidisorder actions are accepted. The engine strategy and source pin are unchanged. Public test-website health checks were replaced with local engine state and NFQUEUE backlog monitoring; there is no background network probe. Explicit namespace/accounting checks cannot be disabled by Python optimization.

Fault tests confirmed child SIGSTOP/SIGKILL degrade to proxy-only and remove the owned table. Normal stop removed the table and preserved router-routed HTTP forwarding. Coordinated proxy/sidecar recreation attached the sidecar to the new proxy container ID and retained working YouTube/image HTTPS. Host conntrack accounting stayed 0. Whole-container freeze, sustained-throughput stress and the five-second backlog branch remain untested; these limits are documented rather than inferred from the passing child-fault tests.
