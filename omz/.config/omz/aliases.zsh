# Shell
alias c='clear'
alias ll='ls -la'

# Git
alias ga='git add -A'
alias gs='git status'
alias gp='git push'

function gc () {
  git commit -m "$1"
}
