# ~/.zshrc
# Rebuilt after accidental reset. Keep machine-specific shell wiring here;
# keep aliases/functions in $ZSH_CUSTOM/*.zsh.

# De-dupe PATH/fpath while preserving first occurrence.
typeset -U path PATH fpath FPATH

# Homebrew: make brew-installed commands and zsh completions available early.
if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

# User/bin paths. PNPM currently has executables in both $PNPM_HOME and $PNPM_HOME/bin.
export PNPM_HOME="$HOME/Library/pnpm"
export BUN_INSTALL="$HOME/.bun"
path=(
  "$HOME/.local/bin"
  "$HOME/.pi/agent/bin"
  "$HOME/.opencode/bin"
  "$PNPM_HOME/bin"
  "$PNPM_HOME"
  "$BUN_INSTALL/bin"
  "$HOME/.npm-global/bin"
  $path
)
export PATH

# Oh My Zsh
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

# Node via nvm.
export NVM_DIR="$HOME/.nvm"
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
[[ -s "$NVM_DIR/bash_completion" ]] && source "$NVM_DIR/bash_completion"

# zoxide: provides `z`.
if command -v zoxide >/dev/null 2>&1; then
  eval "$(zoxide init zsh)"
fi

# fzf shell integration: Ctrl-R history, Ctrl-T files, Alt-C cd, completion.
# fzf's zle bindings should only be loaded when attached to a real terminal.
if [[ -t 0 && -t 1 ]] && command -v fzf >/dev/null 2>&1; then
  eval "$(fzf --zsh)"
fi

# zsh-autosuggestions installed by Homebrew.
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
if [[ -r /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh ]]; then
  source /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh
elif [[ -r /usr/local/share/zsh-autosuggestions/zsh-autosuggestions.zsh ]]; then
  source /usr/local/share/zsh-autosuggestions/zsh-autosuggestions.zsh
fi

# zsh-syntax-highlighting, if installed later. Keep this last among zsh plugins.
if [[ -r /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]]; then
  source /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
elif [[ -r /usr/local/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]]; then
  source /usr/local/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
elif [[ -r "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ]]; then
  source "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
fi


# pnpm
export PNPM_HOME="/Users/brad/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME/bin:"*) ;;
  *) export PATH="$PNPM_HOME/bin:$PATH" ;;
esac
# pnpm end
