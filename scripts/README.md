# scripts/

Operational tooling for the deployed system. Not part of the pnpm workspace or the
Rust crate — these are standalone utilities that run against live hardware.

## `moxa-porttest`

Tests the Moxa NPort serial gateways that connect CNC controls to the network.

```bash
moxa-porttest                                     # TCP check, both gateways
moxa-porttest --loopback                          # loopback, both gateways
moxa-porttest 192.168.10.10 --loopback --ports 1-4
```

**The distinction this tool exists to make:** a TCP connection to a Moxa data port
succeeds whether or not anything is plugged into the serial side. The gateway accepts
the socket regardless. So a clean "32/32 ports open" proves the *network* path and says
nothing at all about wiring — a green result that means far less than it looks like.

Only `--loopback` proves the serial side. It needs a loopback plug fitted (short pins
2↔3 on DB25, TX↔RX on RJ45); bytes written come straight back, exercising the UART,
the connector and the cable together.

Three outcomes:

| Result | Meaning |
|---|---|
| `echo OK` | Port, UART and plug all good |
| `partial (nB) - check baud/parity` | Data returning but mangled — serial settings mismatch |
| `no echo` | No plug fitted, or the port isn't in TCP Server mode |

The middle result is the useful diagnostic: the electrical path works and only the
settings are wrong. The lathe bank runs **4800 7E2 XON/XOFF**.

### Where it runs

Deployed to `/usr/local/bin/moxa-porttest` on the Tapeworm VM, which is the only host
with a leg on the OT VLAN (`192.168.10.20`). Gateways are `192.168.10.10` (lathe,
NPort 5610-16) and `192.168.10.11` (mill, NPort 5650-16), data ports 4001–4016 on each.

Python 3 standard library only — no dependencies to install on the VM.

### Second opinion

The Moxa web console has a **Monitor** page showing DSR/CTS/DCD per port live. Worth
cross-checking against, since it doesn't depend on this script being correct.
