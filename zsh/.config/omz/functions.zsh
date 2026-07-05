# ~/.config/omz/functions.zsh

# Start a Python HTTP server in the current directory.
# Usage: server <port>
function server() {
  emulate -L zsh

  if [[ $# -ne 1 || ! "$1" =~ '^[0-9]+$' || "$1" -lt 1 || "$1" -gt 65535 ]]; then
    print -u2 'Usage: server <port 1-65535>'
    return 2
  fi

  local py
  if command -v python3 >/dev/null 2>&1; then
    py=python3
  elif command -v python >/dev/null 2>&1; then
    py=python
  else
    print -u2 'server: python3/python is not installed or not on PATH'
    return 127
  fi

  print "Serving $PWD at http://localhost:$1/"
  command "$py" -m http.server "$1"
}

# Yazi wrapper: exit yazi into the directory it wrote to --cwd-file.
# Do not define alias y='yazi'; that would shadow this function.
function y() {
  emulate -L zsh

  if ! command -v yazi >/dev/null 2>&1; then
    print -u2 'y: yazi is not installed or not on PATH'
    return 127
  fi

  local tmp cwd
  tmp="$(mktemp -t 'yazi-cwd.XXXXXX')" || return
  yazi "$@" --cwd-file="$tmp"
  if cwd="$(command cat -- "$tmp" 2>/dev/null)" && [[ -n "$cwd" && "$cwd" != "$PWD" ]]; then
    builtin cd -- "$cwd"
  fi
  rm -f -- "$tmp"
}
