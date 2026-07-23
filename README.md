# Brad's dotfiles

Portable macOS/Linux configuration managed with [GNU Stow](https://www.gnu.org/software/stow/).

Each top-level directory is a Stow package whose contents mirror `$HOME`.

## Packages

| Package | Target | Remote Linux use |
|---|---|---|
| `zsh` | `~/.zshrc`, `~/.zprofile`, `~/.config/omz` | Yes |
| `tmux` | `~/.config/tmux` | Yes |
| `pi` | portable `~/.pi/agent` settings, models, extensions, themes | Yes |
| `nvim` | `~/.config/nvim` | Only with a compatible current Neovim |
| `yazi` | `~/.config/yazi` | If Yazi is installed |
| `kitty` | `~/.config/kitty` | Desktop machines only |
| `herdr` | `~/.config/herdr/config.toml` | If Herdr is installed |

## Install

Clone into the home directory:

```bash
git clone https://github.com/brad-j/dotfiles.git ~/dotfiles
cd ~/dotfiles
```

Install Stow:

```bash
# Ubuntu/Debian
sudo apt install stow zsh

# macOS
brew install stow
```

Preview before applying:

```bash
stow -nv zsh tmux pi
```

Apply the portable remote packages:

```bash
stow zsh tmux pi
```

Restow after pulling changes:

```bash
git pull --ff-only
stow -R zsh tmux pi
```

## Machine-local and secret state

Never commit:

- Pi authentication, provider API keys, sessions, package caches, or Epimetheus/Hindsight credentials
- SSH private keys
- shell history
- runtime state and logs

Pi's portable files are tracked under `pi/.pi/agent`. `auth.json`, `epimetheus/`, `sessions/`, `npm/`, caches, trust decisions, and generated model state remain machine-local.

Interactive shell API keys belong in `~/.config/secrets/env.zsh`, with directory mode `700` and file mode `600`. The tracked `.zshrc` sources it when present. Keep the authoritative copy in a password manager.

```bash
install -d -m 700 ~/.config/secrets
install -m 600 /dev/null ~/.config/secrets/env.zsh
```

## Conflicts

Always run `stow -nv` first. If a real target file already exists, compare and back it up before removing it. Do not use `stow --adopt` without reviewing the resulting repository diff.
