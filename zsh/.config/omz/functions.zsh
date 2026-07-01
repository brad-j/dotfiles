# ~/.config/omz/functions.zsh

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
