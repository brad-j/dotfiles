# ~/.zshrc
# Portable interactive Zsh config shared between macOS and Linux.
# Keep aliases/functions in ~/.config/omz/*.zsh.

# De-dupe PATH/fpath while preserving first occurrence.
typeset -U path PATH fpath FPATH

# Homebrew: make brew-installed commands and zsh completions available early.
if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
elif [[ -x /home/linuxbrew/.linuxbrew/bin/brew ]]; then
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
fi

# User/bin paths.
if [[ "$OSTYPE" == darwin* ]]; then
  export PNPM_HOME="${PNPM_HOME:-$HOME/Library/pnpm}"
else
  if [[ -z "${PNPM_HOME:-}" || "$PNPM_HOME" == /Users/* || "$PNPM_HOME" == "$HOME/Library/pnpm" ]]; then
    export PNPM_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/pnpm"
  else
    export PNPM_HOME
  fi
fi
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"

# If a Linux session inherits macOS PATH/PNPM values, strip them before adding
# the Linux equivalents below.
if [[ "$OSTYPE" != darwin* ]]; then
  path=(${path:#/Users/*})
  path=(${path:#$HOME/Library/pnpm})
  path=(${path:#$HOME/Library/pnpm/bin})
fi

path=(
  "$HOME/.local/bin"
  "$PNPM_HOME/bin"
  "$PNPM_HOME"
  "$BUN_INSTALL/bin"
  "$HOME/.npm-global/bin"
  "$HOME/.cargo/bin"
  $path
)
export PATH

# Node via fnm on Linux/this box; fall back to nvm for the Mac.
FNM_PATH="${FNM_PATH:-$HOME/.local/share/fnm}"
if [[ -x "$FNM_PATH/fnm" ]]; then
  path=("$FNM_PATH" $path)
  export PATH
  eval "$("$FNM_PATH/fnm" env --shell zsh)"
elif command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --shell zsh)"
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if ! command -v node >/dev/null 2>&1; then
  [[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
fi
[[ -s "$NVM_DIR/bash_completion" ]] && source "$NVM_DIR/bash_completion"

# Oh My Zsh.
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="agnoster"
zstyle ':omz:update' mode auto
COMPLETION_WAITING_DOTS="true"
ZSH_CUSTOM="$HOME/.config/omz"
plugins=(git)

if [[ -r "$ZSH/oh-my-zsh.sh" ]]; then
  source "$ZSH/oh-my-zsh.sh"
fi

# Preferred editor for local and remote sessions.
if [[ -n "$SSH_CONNECTION" ]]; then
  export EDITOR='vim'
else
  export EDITOR='nvim'
fi

# zoxide: provides `z`.
if command -v zoxide >/dev/null 2>&1; then
  eval "$(zoxide init zsh)"
fi

# fzf shell integration: Ctrl-R history, Ctrl-T files, Alt-C cd, completion.
# fzf's zle bindings should only be loaded when attached to a real terminal.
if [[ -t 0 && -t 1 ]] && command -v fzf >/dev/null 2>&1; then
  eval "$(fzf --zsh)"
fi

# bun completions.
[[ -s "$BUN_INSTALL/_bun" ]] && source "$BUN_INSTALL/_bun"

# zsh-autosuggestions.
# Make one Tab accept the gray suggestion while preserving the current Tab widget.
# fzf's shell integration rebinds Tab to fzf-completion when a real TTY is attached,
# so include both OMZ's and fzf's Tab widgets in the autosuggestion accept list.
ZSH_AUTOSUGGEST_ACCEPT_WIDGETS=(
  forward-char
  end-of-line
  vi-forward-char
  vi-end-of-line
  vi-add-eol
  expand-or-complete
  expand-or-complete-with-dots
  fzf-completion
)
for _autosuggestions in \
  /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
  /usr/local/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
  /home/linuxbrew/.linuxbrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
  /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
  "$HOME/.zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh" \
  "$ZSH_CUSTOM/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh"; do
  if [[ -r "$_autosuggestions" ]]; then
    source "$_autosuggestions"
    break
  fi
done
unset _autosuggestions

# zsh-syntax-highlighting, if installed later. Keep this last among zsh plugins.
for _syntax_highlighting in \
  /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh \
  /usr/local/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh \
  /home/linuxbrew/.linuxbrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh \
  /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh \
  "$HOME/.zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" \
  "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"; do
  if [[ -r "$_syntax_highlighting" ]]; then
    source "$_syntax_highlighting"
    break
  fi
done
unset _syntax_highlighting

# opencode
export PATH=/Users/brad/.opencode/bin:$PATH

# pi

# Tavily API key for pi-web-access
export TAVILY_API_KEY=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
