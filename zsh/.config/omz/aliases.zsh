# ~/.config/omz/aliases.zsh
# Sourced by Oh My Zsh via ZSH_CUSTOM. Keep aliases here; heavier logic in functions.zsh.

# Kitty
alias zedd='kitty --session ~/.config/kitty/kitty-sessions/zedd.kitty-session'
command -v kitty >/dev/null 2>&1 && alias code='kitty --session ~/.config/kitty/kitty-sessions/code.kitty-session'

# Shell
alias c='clear'
command -v nvim >/dev/null 2>&1 && alias n='nvim'
command -v fzf >/dev/null 2>&1 && alias fman='compgen -c | fzf | xargs man'

alias ff='fzf --style full --height 40% --layout reverse --border'

# pnpm / Node tooling
if command -v pnpm >/dev/null 2>&1; then
  alias p='pnpm'
  alias pd='pnpm dev'
  alias pdl='pnpm dlx'
fi
command -v netlify >/dev/null 2>&1 && alias ntl='netlify'
command -v opencode >/dev/null 2>&1 && alias oc='opencode'

# Git
alias ga='git add -A'
alias gp='git push'
alias gc='git commit -m'
alias gs='git status'

# eza
if command -v eza >/dev/null 2>&1; then
  alias ll='eza -la --color=always --icons=always --no-user --no-time --binary'
  alias lt='eza -T --color=always --icons=always --no-user --no-time'
fi

# bat
command -v bat >/dev/null 2>&1 && alias cat='bat'

# Optional tools; aliases only appear if the tool is installed.
command -v lazygit >/dev/null 2>&1 && alias lg='lazygit'

# ssh-add helper. Accepts any of:
#   ssha github/work-mac
#   ssha .ssh/github/work-mac
#   ssha ~/.ssh/github/work-mac
#   ssha ~/.ssh/github/work-mac.pub
# Defaults to github/work-mac. If a .pub path is passed, it adds the matching private key.
function ssha {
  emulate -L zsh

  local key="${1:-github/work-mac}"
  if [[ "$key" == "~/"* ]]; then
    key="$HOME/${key#~/}"
  elif [[ "$key" == "./.ssh/"* ]]; then
    key="$HOME/${key#./}"
  elif [[ "$key" == ".ssh/"* ]]; then
    key="$HOME/$key"
  elif [[ "$key" != /* ]]; then
    key="$HOME/.ssh/$key"
  fi
  key="${key%.pub}"

  if [[ ! -f "$key" ]]; then
    print -u2 "ssha: key not found: $key"
    return 1
  fi

  if [[ -z "${SSH_AUTH_SOCK:-}" ]]; then
    eval "$(ssh-agent -s)" >/dev/null
  else
    ssh-add -l >/dev/null 2>&1
    local agent_status=$?
    if (( agent_status == 2 )); then
      eval "$(ssh-agent -s)" >/dev/null
    fi
  fi

  ssh-add --apple-use-keychain "$key" 2>/dev/null || ssh-add "$key"
}

# Weather
alias weather='curl wttr.in'

# SSH
alias ssh='ssh -t'

# tmux/ssh helpers for agent work on zedd.
#   tz              create/attach the plain SSH doorway to zedd
#   tz k            kill the local zedd doorway session
#   tz project      create/attach ~/code/project on zedd with pi running in tmux
#   tz ~/path       same, using the explicit remote path
#
# Project mode creates two layers:
#   local tmux:  zedd-project  -> keeps the SSH doorway stable
#   remote tmux: project       -> keeps pi/agents alive on zedd
_tz_session_name() {
    emulate -L zsh
    local target="${1%/}"
    local name="${target:t}"
    name="${name//[^A-Za-z0-9_.-]/_}"
    print -r -- "${name:-agent}"
}

# Remote side: resolve a project/path to a directory and create/attach the
# project tmux session with pi as the initial command.
tzr() {
    emulate -L zsh

    local target="${1:-${TZ_PROJECT:-}}"
    if [[ -z "$target" ]]; then
        print -u2 'tzr: expected a project name or remote path'
        return 2
    fi

    local session="$(_tz_session_name "$target")"
    local dir=''
    local -a candidates

    case "$target" in
        /*) candidates=("$target") ;;
        ~/*) candidates=("$HOME/${target#~/}") ;;
        ./*|../*) candidates=("$PWD/$target") ;;
        *) candidates=("$HOME/code/$target" "$HOME/$target" "$target") ;;
    esac

    local candidate
    for candidate in "${candidates[@]}"; do
        if [[ -d "$candidate" ]]; then
            dir="${candidate:A}"
            break
        fi
    done

    if [[ -z "$dir" ]]; then
        print -u2 "tzr: directory not found for '$target'"
        print -u2 'tzr: tried:'
        printf '  %s\n' "${candidates[@]}" >&2
        return 1
    fi

    exec tmux new-session -A -s "$session" -c "$dir" pi
}

tz() {
    emulate -L zsh

    local host="${TZ_HOST:-zedd}"
    local current_host="${HOST%%.*}"
    [[ -z "$current_host" ]] && current_host="$(hostname -s 2>/dev/null)"

    if [[ "${1:-}" == "k" ]]; then
        tmux kill-session -t "$host" 2>/dev/null
        return
    fi

    # No args preserves the old behavior: a plain tmux-backed SSH doorway.
    if [[ $# -eq 0 || "${1:-}" == "$host" ]]; then
        if [[ "$current_host" == "$host" ]]; then
            tmux new-session -A -s "$host"
        else
            tmux has-session -t "$host" 2>/dev/null || tmux new-session -d -s "$host" "ssh -t ${(q)host}"
            tmux attach -t "$host"
        fi
        return
    fi

    local target="$1"

    # If already on zedd, skip the SSH wrapper and go straight to remote tmux.
    if [[ "$current_host" == "$host" ]]; then
        tzr "$target"
        return
    fi

    local remote_session="$(_tz_session_name "$target")"
    local local_session="$host-$remote_session"
    local remote_project="${(qqq)target}"
    local remote_cmd="TZ_PROJECT=$remote_project zsh -ic tzr"

    tmux has-session -t "$local_session" 2>/dev/null || \
        tmux new-session -d -s "$local_session" "ssh -t ${(q)host} ${(q)remote_cmd}"
    tmux attach -t "$local_session"
}

# pi
alias piu='pi update && pi update --extensions'
