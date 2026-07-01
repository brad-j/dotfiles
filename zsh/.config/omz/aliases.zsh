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

# tmux sessions over ssh to zedd: `zedd` is a plain shell on zedd, `hermes`
# runs the hermes agent (installed on zedd at ~/.local/bin/hermes, which is
# only on PATH for a login shell, so it is launched via `bash -lc`).
#   tz             create both (if missing) and attach zedd
#   tz zedd        create (if missing) and attach the zedd shell session
#   tz hermes      create (if missing) and attach the hermes session
#   tz k           kill both sessions
tz() {
    emulate -L zsh
    local target="$1"

    if [[ "$target" == "k" ]]; then
        tmux kill-session -t zedd 2>/dev/null
        tmux kill-session -t hermes 2>/dev/null
        return
    fi

    if [[ -n "$target" && "$target" != zedd && "$target" != hermes ]]; then
        print -u2 "tz: unknown session '$target' (expected: zedd, hermes, or k)"
        return 1
    fi

    local -a sessions
    if [[ -z "$target" ]]; then
        sessions=(zedd hermes)
        target=zedd
    else
        sessions=("$target")
    fi

    local s
    for s in $sessions; do
        tmux has-session -t "$s" 2>/dev/null && continue
        if [[ "$s" == hermes ]]; then
            tmux new-session -d -s hermes "ssh -t zedd 'bash -lc hermes'"
        else
            tmux new-session -d -s zedd "ssh -t zedd"
        fi
    done

    tmux attach -t "$target"
}

# pi
alias piu='pi update && pi update --extensions'

# hermes
alias h='hermes'
