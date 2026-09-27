// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/bind
// Binds shared component logic to a renderer template. Both select.js and
// select.tui implement the same `ui.component(name).does(behaviors).using(source)`
// contract, so the catalogues share this one binding idiom and only differ in
// the `ui` runtime they pass in.

// Function: bind
// Returns the component `name` bound to `source` with `behaviors`.
function bind(ui, name, source, behaviors) {
	return ui.component(name).does(behaviors).using(source)
}

export { bind }

// EOF
