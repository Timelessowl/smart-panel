#!/usr/bin/env sh

set -eu

extension_uuid='simple-bottom-panel@local'
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
extension_dir="${HOME}/.local/share/gnome-shell/extensions/${extension_uuid}"

mkdir -p \
    "${extension_dir}/components" \
    "${extension_dir}/stub"

rm -f \
    "${extension_dir}/components/sectionFrameManager.js" \
    "${extension_dir}/components/workAreaStrut.js" \
    "${extension_dir}/displayScale.js" \
    "${extension_dir}/prefs.js" \
    "${extension_dir}/schemas/gschemas.compiled" \
    "${extension_dir}/schemas/org.gnome.shell.extensions.simple-bottom-panel.gschema.xml"

install -m 0644 "${script_dir}/metadata.json" "${extension_dir}/metadata.json"
install -m 0644 "${script_dir}/extension.js" "${extension_dir}/extension.js"
install -m 0644 "${script_dir}/constant.js" "${extension_dir}/constant.js"
install -m 0644 "${script_dir}/monitorManager.js" "${extension_dir}/monitorManager.js"
install -m 0644 "${script_dir}/themeManager.js" "${extension_dir}/themeManager.js"
install -m 0644 "${script_dir}/transientInputManager.js" "${extension_dir}/transientInputManager.js"
install -m 0644 "${script_dir}/stylesheet.css" "${extension_dir}/stylesheet.css"
install -m 0644 "${script_dir}/components/baseSection.js" "${extension_dir}/components/baseSection.js"
install -m 0644 "${script_dir}/components/bottomPanel.js" "${extension_dir}/components/bottomPanel.js"
install -m 0644 "${script_dir}/components/dashSection.js" "${extension_dir}/components/dashSection.js"
install -m 0644 "${script_dir}/components/debianButton.js" "${extension_dir}/components/debianButton.js"
install -m 0644 "${script_dir}/components/indicatorSection.js" "${extension_dir}/components/indicatorSection.js"
install -m 0644 "${script_dir}/components/searchSection.js" "${extension_dir}/components/searchSection.js"
install -m 0644 "${script_dir}/components/systemSection.js" "${extension_dir}/components/systemSection.js"
install -m 0644 "${script_dir}/stub/dashPopulationTab.js" "${extension_dir}/stub/dashPopulationTab.js"
install -m 0644 "${script_dir}/stub/indicatorPopulationTab.js" "${extension_dir}/stub/indicatorPopulationTab.js"
install -m 0644 "${script_dir}/stub/mockDashApps.js" "${extension_dir}/stub/mockDashApps.js"
install -m 0644 "${script_dir}/stub/mockIndicators.js" "${extension_dir}/stub/mockIndicators.js"
install -m 0644 "${script_dir}/stub/stubController.js" "${extension_dir}/stub/stubController.js"

echo "Installed ${extension_uuid} to ${extension_dir}"
echo "Enable it with: gnome-extensions enable ${extension_uuid}"
echo "If it was already enabled, reload it by disabling and enabling it again."
echo "On X11, restart GNOME Shell first with Alt+F2, then enter r."
echo "On Wayland, log out and back in if the extension is not visible yet."
