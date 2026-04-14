---
'brevwick-sdk': minor
'brevwick-react': minor
---

Allow `http://` endpoints on loopback hostnames (`localhost`, `127.0.0.1`, `[::1]`) so integrators can point `createBrevwick` at a local `brevwick-api` without standing up TLS. Non-loopback hosts still require `https:`. The eager-bundle gzip budget is bumped from < 2 kB to < 2.2 kB to accommodate the three extra hostname checks (SDD § 12 + `CLAUDE.md` updated in lockstep). `.localhost` subdomain aliases are NOT accepted; use `127.0.0.1` instead.
