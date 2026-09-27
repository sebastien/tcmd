# --
# Runs the local Web UI server: bundles `public/main.js` with Bun and serves
# `public/` plus the `/api/*` filesystem API on http://localhost:$(TCMD_WEB_PORT).
# Same as `bun run web`. Blocking; Ctrl-C stops it.
.PHONY: run-local
run-local: ## Serves the Web UI on http://localhost:$(TCMD_WEB_PORT)
	@$(call rule_pre_cmd)
	$(call shell_try,PORT=$(TCMD_WEB_PORT) $(BUN) run web,Unable to start the Web UI server)
	@$(call rule_post_cmd,$@)

# EOF
