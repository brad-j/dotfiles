#!/usr/bin/env bash

# Filename: ~/.config/kitty/scripts/kitty-list-sessions.sh
# Shows Kitty session files in fzf and switches using goto_session.
# Sessions are read from: ~/.config/kitty/kitty-sessions
# Adds a vim-like mode:
# - Normal mode: j/k move, ctrl-u/d half-page, ctrl-b/f page, g/G top/bottom,
#   d closes the selected active session, enter/l/o opens, i/a// enters insert/search mode, esc/q quits
# - Insert mode: type to filter, ctrl-j/k or ctrl-n/p move, enter opens, esc returns to normal mode

set -euo pipefail

default_mode="normal"

set_cursor_block() {
  # DECSCUSR: steady block
  { printf '\e[2 q' >/dev/tty; } 2>/dev/null || true
}

set_cursor_bar() {
  # DECSCUSR: steady bar
  { printf '\e[6 q' >/dev/tty; } 2>/dev/null || true
}

# Always restore to bar on exit
trap 'set_cursor_bar' EXIT

kitty_bin="/Applications/kitty.app/Contents/MacOS/kitty"
kitty_config_dir="${KITTY_CONFIG_DIRECTORY:-$HOME/.config/kitty}"
sessions_dir="$kitty_config_dir/kitty-sessions"

# Prefer the socket Kitty gives to child processes. If it is not present,
# let `kitty @` fall back to the controlling terminal.
kitty_to_opt=()
if [[ -n "${KITTY_LISTEN_ON:-}" ]]; then
  kitty_to_opt=(--to "$KITTY_LISTEN_ON")
fi

kitty_remote() {
  "$kitty_bin" @ "${kitty_to_opt[@]}" "$@"
}

# Requirements
if ! command -v fzf >/dev/null 2>&1; then
  echo "fzf is not installed or not in PATH."
  echo "Install (brew): brew install fzf"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is not installed or not in PATH."
  echo "Install (brew): brew install jq"
  exit 1
fi

if [[ ! -x "$kitty_bin" ]]; then
  echo "kitty binary not found at: $kitty_bin"
  exit 1
fi

if [[ ! -d "$sessions_dir" ]]; then
  echo "Kitty sessions directory not found: $sessions_dir"
  exit 1
fi

if ! kitty_remote ls >/dev/null 2>&1; then
  echo "Unable to connect to Kitty remote control."
  echo "Run this from inside Kitty, or make sure allow_remote_control/listen_on are enabled."
  exit 1
fi

session_display_name() {
  local file="$1"
  local name
  name="$(basename "$file")"
  name="${name%.kitty-session}"
  name="${name%.kitty_session}"
  name="${name%.session}"
  printf "%s" "$name"
}

session_cwd() {
  local file="$1"
  awk '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*cd[[:space:]]+/ {
      sub(/^[[:space:]]*cd[[:space:]]+/, "")
      print
      exit
    }
  ' "$file" 2>/dev/null || true
}

pretty_path() {
  local path="$1"

  # Strip simple quotes around the path from session files.
  path="${path%\"}"
  path="${path#\"}"
  path="${path%\'}"
  path="${path#\'}"

  case "$path" in
    '~') path="$HOME" ;;
    '~/'*) path="$HOME/${path#\~/}" ;;
    '$HOME') path="$HOME" ;;
    '$HOME/'*) path="$HOME/${path#\$HOME/}" ;;
  esac

  if [[ -n "$HOME" && "$path" == "$HOME" ]]; then
    path="~"
  elif [[ -n "$HOME" && "$path" == "$HOME"/* ]]; then
    path="~/${path#"$HOME"/}"
  fi

  printf "%s" "$path"
}

active_session_names() {
  kitty_remote ls 2>/dev/null | jq -r '
    [
      .[] as $os
      | $os.tabs[] as $tab
      | $tab.windows[]?
      | select(.session_name != null and .session_name != "")
      | .session_name
    ]
    | unique
    | .[]
  ' 2>/dev/null || true
}

session_is_active() {
  local file="$1"
  local name="$2"
  local basename_file
  basename_file="$(basename "$file")"

  [[ -z "${active_names:-}" ]] && return 1

  printf "%s\n" "$active_names" | grep -Fxq -- "$file" && return 0
  printf "%s\n" "$active_names" | grep -Fxq -- "$name" && return 0
  printf "%s\n" "$active_names" | grep -Fxq -- "$basename_file" && return 0

  return 1
}

build_menu_lines() {
  local active_names=""
  local raw_lines=""

  active_names="$(active_session_names)"

  raw_lines="$({
    find "$sessions_dir" -maxdepth 1 -type f \( \
      -name '*.kitty-session' -o \
      -name '*.kitty_session' -o \
      -name '*.session' \
    \) | sort | while IFS= read -r file; do
      local name=""
      local cwd=""
      local display_cwd=""
      local marker=""

      name="$(session_display_name "$file")"
      cwd="$(session_cwd "$file")"
      if [[ -z "$cwd" ]]; then
        cwd="$(dirname "$file")"
      fi
      display_cwd="$(pretty_path "$cwd")"

      if session_is_active "$file" "$name"; then
        marker="* "
      fi

      # target<TAB>pretty_display
      printf "%s\t%s%s  %s\n" "$file" "$marker" "$name" "$display_cwd"
    done
  } || true)"

  if [[ -z "${raw_lines:-}" ]]; then
    return 1
  fi

  # idx<TAB>target<TAB>pretty_display
  printf "%s\n" "$raw_lines" | awk -F'\t' '{
    idx=NR
    target=$1
    display=$2
    printf "%d\t%s\t%s\n", idx, target, display
  }'
}

if [[ "${1:-}" == "--print" ]]; then
  build_menu_lines
  exit 0
fi

# Set the startup mode
mode="$default_mode"
fzf_start_pos=""

while true; do
  menu_lines="$(build_menu_lines || true)"
  if [[ -z "${menu_lines:-}" ]]; then
    echo "No session files found in: $sessions_dir"
    exit 1
  fi

  fzf_out=""
  fzf_rc=0

  if [[ "$mode" == "normal" ]]; then
    # Normal mode:
    # - Search disabled (typing doesn't filter)
    # - j/k move
    # - ctrl-u/d half-page, ctrl-b/f page, g/G top/bottom
    # - d closes selected active session
    # - enter/l/o opens session
    # - i/a// enters insert/search mode
    # - esc/q/h quits
    # - --no-clear avoids a visible screen "flash"
    set_cursor_block
    set +e
    fzf_start_pos_opt=()
    if [[ -n "${fzf_start_pos:-}" && "$fzf_start_pos" -gt 1 ]]; then
      fzf_start_action="down"
      for ((i = 3; i <= fzf_start_pos; i++)); do
        fzf_start_action+="+down"
      done
      # Workaround for older fzf where start:* actions are ignored.
      # Based on https://github.com/junegunn/fzf/issues/4559
      fzf_start_pos_opt=(--bind "result:${fzf_start_action}")
    fi
    fzf_out="$(
      printf "%s\n" "$menu_lines" |
        fzf --height=100% --reverse \
          --header="Normal: j/k move, C-u/d half-page, g/G top/bottom, / search, l/enter open, d close, q quit" \
          --prompt="Kitty Sessions > " \
          --no-multi --disabled \
          --with-nth=3.. \
          --expect=enter,d,i,a,/,l,o,esc \
          --bind 'j:down,k:up' \
          --bind 'ctrl-d:half-page-down,ctrl-u:half-page-up' \
          --bind 'ctrl-f:page-down,ctrl-b:page-up' \
          --bind 'g:first,G:last' \
          --bind 'enter:accept,l:accept,o:accept,d:accept,i:accept,a:accept,/:accept' \
          --bind 'esc:abort,q:abort,h:abort' \
          --no-clear \
          ${fzf_start_pos_opt[@]+"${fzf_start_pos_opt[@]}"}

    )"
    fzf_rc=$?
    fzf_start_pos=""
    set -e
  else
    # Insert mode:
    # - Search enabled (type to filter)
    # - ctrl-j/k and ctrl-n/p move without leaving insert mode
    # - enter opens session
    # - esc returns to normal mode
    # - --no-clear avoids a visible screen "flash"
    set_cursor_bar
    set +e
    fzf_out="$(
      printf "%s\n" "$menu_lines" |
        fzf --height=100% --reverse \
          --header="Insert: type to filter, C-j/k move, enter open, esc normal" \
          --prompt="Kitty Sessions > " \
          --no-multi \
          --with-nth=3.. \
          --expect=enter,esc \
          --bind 'ctrl-j:down,ctrl-k:up,ctrl-n:down,ctrl-p:up' \
          --bind 'ctrl-d:half-page-down,ctrl-u:half-page-up' \
          --bind 'enter:accept' \
          --bind 'esc:abort' \
          --no-clear
    )"
    fzf_rc=$?
    set -e
  fi

  # If fzf aborted and gave no output, treat it like "esc"
  if [[ $fzf_rc -ne 0 && -z "${fzf_out:-}" ]]; then
    key="esc"
    sel=""
  else
    key="$(printf "%s\n" "$fzf_out" | head -n1)"
    sel="$(printf "%s\n" "$fzf_out" | sed -n '2p' || true)"
  fi

  # Selection line is: idx<TAB>target<TAB>pretty_display
  selected_target=""
  selected_index=""
  if [[ -n "${sel:-}" ]]; then
    selected_index="$(printf "%s" "$sel" | awk -F'\t' '{print $1}')"
    selected_target="$(printf "%s" "$sel" | awk -F'\t' '{print $2}')"
  fi

  if [[ "$mode" == "insert" && "$key" == "esc" ]]; then
    mode="normal"
    continue
  fi

  if [[ "$mode" == "normal" && "$key" == "esc" ]]; then
    exit 0
  fi

  if [[ "$mode" == "normal" && ( "$key" == "i" || "$key" == "a" || "$key" == "/" ) ]]; then
    mode="insert"
    continue
  fi

  if [[ -z "${selected_target:-}" ]]; then
    # Nothing selected (likely esc)
    if [[ "$mode" == "normal" ]]; then
      exit 0
    fi
    mode="normal"
    continue
  fi

  if [[ "$mode" == "normal" && "$key" == "d" ]]; then
    if [[ "${selected_index:-}" =~ ^[0-9]+$ ]]; then
      total_lines="$(printf "%s\n" "$menu_lines" | awk 'END{print NR}')"
      if [[ -n "${total_lines:-}" && "$selected_index" -ge "$total_lines" ]]; then
        fzf_start_pos=$((selected_index - 1))
      else
        fzf_start_pos=$selected_index
      fi
      if [[ "$fzf_start_pos" -lt 1 ]]; then
        fzf_start_pos=1
      fi
    fi
    kitty_remote action close_session "$selected_target" >/dev/null 2>&1 || true
    continue
  fi

  if [[ "$key" == "enter" || "$key" == "l" || "$key" == "o" || -z "$key" ]]; then
    kitty_remote action goto_session "$selected_target"
    exit 0
  fi

  # Fallback behavior:
  # - In insert mode, abort returns here -> go back to normal
  # - In normal mode, unknown key -> exit
  if [[ "$mode" == "insert" ]]; then
    mode="normal"
    continue
  fi

  exit 0
done
