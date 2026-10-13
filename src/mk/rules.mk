# --
# Runs the local Web UI server: bundles `public/main.js` with Bun and serves
# `public/` plus the `/api/*` filesystem API on http://localhost:$(TCMD_WEB_PORT).
# Same as `bun run web`. Blocking; Ctrl-C stops it.
.PHONY: run-local
run-local: ## Serves the Web UI on http://localhost:$(TCMD_WEB_PORT)
	@$(call rule_pre_cmd)
	$(call shell_try,PORT=$(TCMD_WEB_PORT) $(BUN) run web,Unable to start the Web UI server)
	@$(call rule_post_cmd,$@)

# --
# Tests and publishes the npm package.
#
# Publishing needs a second factor: the account uses two-factor auth in
# "auth-and-writes" mode, so the registry answers the write with 401/EOTP and
# npm (`lib/utils/auth.js`) offers to get the factor from the web at
# https://www.npmjs.com/auth/cli/<id>. With no `DISPLAY`, opening that URL goes
# through xdg-open, which exits 3, which npm treats as fatal (open-url.js only
# forgives 127) - hence "no DISPLAY environment variable specified" and
# "make: *** Error 3". Two ways out:
#   - `make release OTP=123456` answers the challenge directly, no browser;
#   - or approve the URL npm prints below, from any device, while it polls.
# `--browser=false` (applied here only when there is no local display) is what
# makes npm print the URL instead of trying to launch a browser and dying.
NPM_REGISTRY:=https://registry.npmjs.org/
NPM_SCOPE:=@ssebastien
NPM_BROWSER?=$(if $(or $(DISPLAY),$(WAYLAND_DISPLAY)),,--browser=false)
OTP?=

.PHONY: release
release: ## Tests and publishes the npm package (OTP=123456, or approve the printed URL)
	@npm whoami --registry=$(NPM_REGISTRY) >/dev/null 2>&1 || { echo "[RELEASE] Log in to npm first: npm login --scope=$(NPM_SCOPE) --registry=$(NPM_REGISTRY)" >&2; exit 1; }
	$(BUN) test tests
	npm publish --registry=$(NPM_REGISTRY) $(NPM_BROWSER) $(if $(strip $(OTP)),--otp=$(strip $(OTP)))

# EOF
