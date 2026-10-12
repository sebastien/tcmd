# --
# Runs the local Web UI server: bundles `public/main.js` with Bun and serves
# `public/` plus the `/api/*` filesystem API on http://localhost:$(TCMD_WEB_PORT).
# Same as `bun run web`. Blocking; Ctrl-C stops it.
.PHONY: run-local
run-local: ## Serves the Web UI on http://localhost:$(TCMD_WEB_PORT)
	@$(call rule_pre_cmd)
	$(call shell_try,PORT=$(TCMD_WEB_PORT) $(BUN) run web,Unable to start the Web UI server)
	@$(call rule_post_cmd,$@)

.PHONY: release
release: ## Tests and publishes the npm package
	@npm whoami --registry=https://registry.npmjs.org/ >/dev/null 2>&1 || { echo "[RELEASE] Log in to npm first: npm login --scope=@ssebastien --registry=https://registry.npmjs.org/" >&2; exit 1; }
	$(BUN) test tests
	npm publish

# EOF
