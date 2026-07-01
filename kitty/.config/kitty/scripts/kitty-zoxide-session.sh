#!/usr/bin/env bash

# Filename: ~/.config/kitty/scripts/kitty-zoxide-session.sh
# Pick a zoxide directory or SSH host and switch to an existing Kitty session,
# or create one if it does not already exist.
#
# Directory entries come from zoxide.
# SSH entries come from ~/.ssh/config and any Include files.

set -euo pipefail

default_mode="normal"

kitty_bin="/Applications/kitty.app/Contents/MacOS/kitty"
session_dir="${KITTY_ZOXIDE_SESSION_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/kitty/zoxide-sessions}"

# Prefer the socket Kitty gives to child processes. If it is not present,
# let `kitty @` fall back to the controlling terminal.
kitty_to_opt=()
if [[ -n "${KITTY_LISTEN_ON:-}" ]]; then
  kitty_to_opt=(--to "$KITTY_LISTEN_ON")
fi

kitty_remote() {
  "$kitty_bin" @ "${kitty_to_opt[@]}" "$@"
}

set_cursor_block() {
  # DECSCUSR: steady block
  { printf '\e[2 q' >/dev/tty; } 2>/dev/null || true
}

set_cursor_bar() {
  # DECSCUSR: steady bar
  { printf '\e[6 q' >/dev/tty; } 2>/dev/null || true
}

trap 'set_cursor_bar' EXIT

require_cmd() {
  local cmd="$1"
  local install_hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd is not installed or not in PATH."
    echo "$install_hint"
    exit 1
  fi
}

require_cmd fzf "Install (brew): brew install fzf"
require_cmd jq "Install (brew): brew install jq"
require_cmd zoxide "Install (brew): brew install zoxide"

if [[ ! -x "$kitty_bin" ]]; then
  echo "kitty binary not found at: $kitty_bin"
  exit 1
fi

if ! kitty_remote ls >/dev/null 2>&1; then
  echo "Unable to connect to Kitty remote control."
  echo "Run this from inside Kitty, or make sure allow_remote_control/listen_on are enabled."
  exit 1
fi

normalize_path() {
  local path="$1"

  if command -v realpath >/dev/null 2>&1; then
    realpath "$path"
    return 0
  fi

  python3 - "$path" <<'PY'
import os
import sys
print(os.path.realpath(sys.argv[1]))
PY
}

hash_path() {
  local path="$1"

  if command -v shasum >/dev/null 2>&1; then
    printf "%s" "$path" | shasum -a 256 | awk '{print $1}'
    return 0
  fi

  python3 - "$path" <<'PY'
import hashlib
import sys
print(hashlib.sha256(sys.argv[1].encode("utf-8")).hexdigest())
PY
}

session_quote() {
  local value="$1"
  value=${value//\'/\'\\\'\'}
  printf "'%s'" "$value"
}

pretty_path() {
  local path="$1"

  if [[ -n "$HOME" && "$path" == "$HOME" ]]; then
    path="~"
  elif [[ -n "$HOME" && "$path" == "$HOME"/* ]]; then
    path="~/${path#"$HOME"/}"
  fi

  printf "%s" "$path"
}

safe_name() {
  local value="$1"
  printf "%s" "$value" | tr -cs 'A-Za-z0-9._-' '_'
}

find_session_by_path() {
  local target="$1"
  local name=""
  local pwd=""
  local real=""

  while IFS=$'\t' read -r name pwd; do
    [[ -z "$name" || -z "$pwd" ]] && continue
    [[ ! -d "$pwd" ]] && continue
    real="$(normalize_path "$pwd" 2>/dev/null || true)"
    if [[ "$real" == "$target" ]]; then
      printf "%s" "$name"
      return 0
    fi
  done < <(
    kitty_remote ls 2>/dev/null | jq -r '
      .[]?.tabs[]?.windows[]?
      | select(.session_name != null and .session_name != "")
      | [(.session_name|tostring), (.cwd // .env.PWD // "")]
      | @tsv
    '
  )

  return 1
}

bump_zoxide_score() {
  local path="$1"
  zoxide add -- "$path" >/dev/null 2>&1 || true
}

collect_ssh_config_files() {
  local root_config="$HOME/.ssh/config"
  local file=""
  local line=""
  local includes=""
  local pattern=""
  local match=""
  local queue=()
  local files=()
  local processed="|"
  local old_nullglob=""

  [[ -f "$root_config" ]] || return 0

  queue+=("$root_config")

  old_nullglob="$(shopt -p nullglob || true)"
  shopt -s nullglob

  while ((${#queue[@]})); do
    file="${queue[0]}"
    queue=("${queue[@]:1}")

    case "$processed" in
      *"|${file}|"*) continue ;;
    esac
    processed+="${file}|"

    [[ -f "$file" ]] || continue
    files+=("$file")

    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line%%#*}"
      if [[ "$line" =~ ^[[:space:]]*Include[[:space:]]+(.+) ]]; then
        includes="${BASH_REMATCH[1]}"
        for pattern in $includes; do
          pattern="${pattern/#~/$HOME}"
          if [[ "$pattern" != /* ]]; then
            pattern="$(dirname "$file")/$pattern"
          fi
          for match in $pattern; do
            [[ -f "$match" ]] && queue+=("$match")
          done
        done
      fi
    done <"$file"
  done

  eval "$old_nullglob"

  printf "%s\n" "${files[@]}"
}

print_ssh_menu_lines() {
  local config_files=()
  local host=""
  local label=""

  while IFS= read -r file; do
    [[ -n "$file" ]] && config_files+=("$file")
  done < <(collect_ssh_config_files)

  ((${#config_files[@]})) || return 0

  while IFS= read -r host; do
    [[ -z "$host" ]] && continue
    label="ssh-${host}"
    printf "%s\t%s\n" "ssh:${host}" "$label"
  done < <(
    awk '
      {
        sub(/[ \t]*#.*/, "")
        if (tolower($1) == "host") {
          for (i = 2; i <= NF; i++) {
            host = $i
            if (host ~ /^[!]/) continue
            if (host ~ /[\*?]/) continue
            print host
          }
        }
      }
    ' "${config_files[@]}" | sort -u
  )
}

print_zoxide_menu_lines() {
  local path=""
  local real=""
  local base=""
  local display_path=""

  while IFS= read -r path; do
    [[ -d "$path" ]] || continue
    real="$(normalize_path "$path" 2>/dev/null || true)"
    [[ -n "$real" ]] || continue
    base="$(basename "$real")"
    display_path="$(pretty_path "$real")"
    printf "%s\t%s  %s\n" "$real" "$base" "$display_path"
  done < <(zoxide query -l 2>/dev/null || true)
}

build_menu_lines() {
  local raw_lines=""

  raw_lines="$({
    print_zoxide_menu_lines
    print_ssh_menu_lines
  } || true)"

  [[ -n "${raw_lines:-}" ]] || return 1

  # idx<TAB>target<TAB>pretty_display
  printf "%s\n" "$raw_lines" | awk -F'\t' '{
    idx=NR
    target=$1
    display=$2
    printf "%d\t%s\t%s\n", idx, target, display
  }'
}

session_file_for_dir() {
  local selected_real="$1"
  local base="$2"
  local safe_base=""
  local hash=""

  safe_base="$(safe_name "$base")"
  hash="$(hash_path "$selected_real")"
  hash="${hash:0:6}"

  printf "%s/z-%s-%s.kitty-session" "$session_dir" "$safe_base" "$hash"
}

focus_or_launch_dir() {
  local selected_path="$1"
  local selected_real=""
  local base=""
  local existing_session=""
  local session_file=""

  if [[ ! -d "$selected_path" ]]; then
    echo "Directory not found: $selected_path"
    exit 1
  fi

  selected_real="$(normalize_path "$selected_path")"
  base="$(basename "$selected_real")"

  existing_session="$(find_session_by_path "$selected_real" || true)"
  if [[ -n "$existing_session" ]]; then
    bump_zoxide_score "$selected_real"
    kitty_remote action goto_session "$existing_session"
    return 0
  fi

  mkdir -p "$session_dir"
  session_file="$(session_file_for_dir "$selected_real" "$base")"

  cat >"$session_file" <<EOF
layout tall
cd $(session_quote "$selected_real")
launch --title $(session_quote "$base")
focus
focus_os_window
EOF

  kitty_remote action goto_session "$session_file"
  bump_zoxide_score "$selected_real"
}

focus_or_launch_ssh() {
  local host="$1"
  local safe_host=""
  local session_file=""

  safe_host="$(safe_name "$host")"

  mkdir -p "$session_dir"
  session_file="${session_dir}/ssh-${safe_host}.kitty-session"

  cat >"$session_file" <<EOF
layout tall
launch --title $(session_quote "ssh-${host}") ssh $(session_quote "$host")
focus
focus_os_window
EOF

  kitty_remote action goto_session "$session_file"
}

if [[ "${1:-}" == "--print" || "${1:-}" == "--reload" ]]; then
  build_menu_lines
  exit 0
fi

mode="$default_mode"
fzf_start_pos=""

while true; do
  menu_lines="$(build_menu_lines || true)"
  if [[ -z "${menu_lines:-}" ]]; then
    echo "No zoxide directories or SSH hosts found."
    exit 1
  fi

  fzf_out=""
  fzf_rc=0

  if [[ "$mode" == "normal" ]]; then
    set_cursor_block
    set +e
    fzf_start_pos_opt=()
    if [[ -n "${fzf_start_pos:-}" && "$fzf_start_pos" -gt 1 ]]; then
      fzf_start_action="down"
      for ((i = 3; i <= fzf_start_pos; i++)); do
        fzf_start_action+="+down"
      done
      fzf_start_pos_opt=(--bind "result:${fzf_start_action}")
    fi

    fzf_out="$(
      printf "%s\n" "$menu_lines" |
        fzf --exact --height=20 --reverse \
          --header="Normal: j/k move, C-u/d half-page, g/G top/bottom, / search, l/enter open, q quit" \
          --prompt="Create/Switch Kitty Session > " \
          --no-multi --disabled \
          --with-nth=3.. \
          --no-sort \
          --tiebreak=index \
          --expect=enter,i,a,/,l,o,esc \
          --bind 'j:down,k:up' \
          --bind 'ctrl-d:half-page-down,ctrl-u:half-page-up' \
          --bind 'ctrl-f:page-down,ctrl-b:page-up' \
          --bind 'g:first,G:last' \
          --bind 'enter:accept,l:accept,o:accept,i:accept,a:accept,/:accept' \
          --bind 'esc:abort,q:abort,h:abort' \
          --no-clear \
          ${fzf_start_pos_opt[@]+"${fzf_start_pos_opt[@]}"}
    )"
    fzf_rc=$?
    fzf_start_pos=""
    set -e
  else
    set_cursor_bar
    set +e
    fzf_out="$(
      printf "%s\n" "$menu_lines" |
        fzf --exact --height=20 --reverse \
          --header="Insert: type to filter, C-j/k move, enter open, esc normal" \
          --prompt="Create/Switch Kitty Session > " \
          --no-multi \
          --with-nth=3.. \
          --no-sort \
          --tiebreak=index \
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

  if [[ $fzf_rc -ne 0 && -z "${fzf_out:-}" ]]; then
    key="esc"
    sel=""
  else
    key="$(printf "%s\n" "$fzf_out" | head -n1)"
    sel="$(printf "%s\n" "$fzf_out" | sed -n '2p' || true)"
  fi

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
    if [[ "$mode" == "normal" ]]; then
      exit 0
    fi
    mode="normal"
    continue
  fi

  if [[ "$key" == "enter" || "$key" == "l" || "$key" == "o" || -z "$key" ]]; then
    if [[ "$selected_target" == ssh:* ]]; then
      focus_or_launch_ssh "${selected_target#ssh:}"
    else
      focus_or_launch_dir "$selected_target"
    fi
    exit 0
  fi

  if [[ "$mode" == "insert" ]]; then
    mode="normal"
    continue
  fi

  exit 0
done
