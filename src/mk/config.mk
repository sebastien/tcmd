## Local Web UI server (`make run-local`)
# `src/js/tcmd/web/server.js` reads PORT and binds to loopback; the page then
# uses OPFS when available and falls back to `/api/*` otherwise.
TCMD_WEB_PORT?=8787

# Registered here, not in `src/mk/rules.mk`: the standard `run` rule expands
# `RUN_ALL` while `src/mk/config.mk` is parsed, before `src/mk/rules.mk` is
# loaded, so appending to `RUN_ALL` there would be ignored.
RUN_ALL+=run-local
# EOF
