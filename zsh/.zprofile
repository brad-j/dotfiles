# ~/.zprofile
# Login-shell setup. Keep interactive shell behavior in ~/.zshrc.

typeset -U path PATH

if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
elif [[ -x /home/linuxbrew/.linuxbrew/bin/brew ]]; then
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
fi

path=(
  "$HOME/.local/bin"
  "$HOME/.pi/agent/bin"
  "$HOME/bin"
  $path
)
export PATH
