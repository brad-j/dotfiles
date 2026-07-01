# Brad's Dotfiles

Personal macOS dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

Each top-level directory is a Stow package. The directory structure inside each package mirrors `$HOME`, so running `stow <package>` from this repo creates symlinks back into the repo.

## Packages

| Package | Links to | Notes |
| --- | --- | --- |
| `nvim` | `~/.config/nvim` | Neovim Lua config and plugin lockfile. |
| `tmux` | `~/.config/tmux` | tmux config. |
| `pi` | selected `~/.pi` files | Pi coding agent settings, models, trusted dirs, extensions, and themes. |
| `zsh` | `~/.zshrc`, `~/.zprofile`, `~/.config/omz` | Zsh login/interactive config and Oh My Zsh custom aliases/functions. |
| `yazi` | `~/.config/yazi` | Yazi file manager config and theme. |
| `kitty` | `~/.config/kitty` | Kitty terminal config, Tokyo Night theme, session helpers, and scripts. |

## Layout

```text
~/dotfiles
├── nvim/
│   └── .config/nvim/
├── tmux/
│   └── .config/tmux/
├── pi/
│   └── .pi/agent/
│       ├── extensions/
│       ├── themes/
│       ├── models.json
│       ├── settings.json
│       └── trust.json
├── zsh/
│   ├── .zprofile
│   ├── .zshrc
│   └── .config/omz/
│       ├── aliases.zsh
│       └── functions.zsh
├── yazi/
│   └── .config/yazi/
│       ├── theme.toml
│       └── yazi.toml
└── kitty/
    └── .config/kitty/
        ├── current-theme.conf
        ├── kitty.conf
        ├── kitty-sessions/
        └── scripts/
            ├── kitty-list-sessions.sh
            └── kitty-zoxide-session.sh
```

## First-time setup

Install Stow if needed:

```bash
brew install stow
```

Clone the repo into your home directory:

```bash
git clone git@github.com:brad-j/dotfiles.git ~/dotfiles
cd ~/dotfiles
```

Preview what Stow will do:

```bash
stow -nv nvim tmux pi zsh yazi kitty
```

Apply the symlinks:

```bash
stow nvim tmux pi zsh yazi kitty
```

## Common commands

Restow everything after changing package contents:

```bash
cd ~/dotfiles
stow -R nvim tmux pi zsh yazi kitty
```

Preview a restow without changing anything:

```bash
cd ~/dotfiles
stow -nvR nvim tmux pi zsh yazi kitty
```

Unstow a package:

```bash
cd ~/dotfiles
stow -D tmux
```

Stow one package:

```bash
cd ~/dotfiles
stow nvim
```

## Current expected symlinks

```text
~/.config/nvim              -> ../dotfiles/nvim/.config/nvim
~/.config/tmux              -> ../dotfiles/tmux/.config/tmux
~/.pi/agent/settings.json   -> ../../dotfiles/pi/.pi/agent/settings.json
~/.pi/agent/models.json     -> ../../dotfiles/pi/.pi/agent/models.json
~/.pi/agent/trust.json      -> ../../dotfiles/pi/.pi/agent/trust.json
~/.pi/agent/extensions      -> ../../dotfiles/pi/.pi/agent/extensions
~/.pi/agent/themes          -> ../../dotfiles/pi/.pi/agent/themes
~/.zshrc                    -> dotfiles/zsh/.zshrc
~/.zprofile                 -> dotfiles/zsh/.zprofile
~/.config/omz               -> ../dotfiles/zsh/.config/omz
~/.config/yazi              -> ../dotfiles/yazi/.config/yazi
~/.config/kitty             -> ../dotfiles/kitty/.config/kitty
```

## Handling Stow conflicts

If Stow reports that an existing target is not owned by Stow, it usually means a real file, directory, or manual symlink already exists at the destination.

Example:

```text
WARNING! stowing tmux would cause conflicts:
  * existing target is not owned by stow: .config/tmux/tmux.conf
```

Fix by inspecting the target first, then either moving it into the matching package or backing it up/removing it before re-running Stow.

```bash
ls -ld ~/.config/tmux ~/.config/tmux/tmux.conf
readlink ~/.config/tmux/tmux.conf
```

Do not blindly delete files unless you know they are already represented in this repo.

## Pi notes

Only portable Pi configuration/customization files are tracked:

- `~/.pi/agent/settings.json`
- `~/.pi/agent/models.json`
- `~/.pi/agent/trust.json`
- `~/.pi/agent/extensions/`
- `~/.pi/agent/themes/`

Private, generated, or machine-local Pi state is intentionally not tracked:

- `~/.pi/agent/auth.json`
- `~/.pi/web-search.json`
- `~/.pi/agent/sessions/`
- `~/.pi/agent/bin/`
- `~/.pi/agent/git/`
- `*.jsonl` session logs

The repo `.gitignore` includes guards for these files so secrets and large generated session data do not get committed accidentally.

## Zsh notes

Tracked Zsh files:

- `~/.zshrc`
- `~/.zprofile`
- `~/.config/omz/aliases.zsh`
- `~/.config/omz/functions.zsh`

Intentionally not tracked:

- `~/.zsh_history`
- `~/.zsh_sessions/`
- `.zcompdump*`
- `.zshrc.bak-*`
- `~/.oh-my-zsh/`

`~/.oh-my-zsh` is treated as installed framework code. Custom shell behavior belongs in `~/.zshrc` or `~/.config/omz/*.zsh`.

## Yazi notes

Tracked Yazi files:

- `~/.config/yazi/yazi.toml`
- `~/.config/yazi/theme.toml`

Intentionally not tracked:

- `~/.local/state/yazi/`
- Homebrew cache files
- crash reports

## Kitty notes

Tracked Kitty files:

- `~/.config/kitty/kitty.conf`
- `~/.config/kitty/current-theme.conf`
- `~/.config/kitty/scripts/kitty-list-sessions.sh`
- `~/.config/kitty/scripts/kitty-zoxide-session.sh`
- `~/.config/kitty/kitty-sessions/` via `.gitkeep`

Intentionally not tracked:

- `~/Library/Caches/kitty/`
- `~/.cache/kitty/`
- `~/.oh-my-zsh/plugins/kitty/`
- logs/runtime files

`kitty-sessions/` is tracked as an empty directory so session helper scripts have a stable place to look for manually authored `.kitty-session` files.

## Workflow

After editing dotfiles through their live paths, changes are written into this repo because the live paths are symlinks.

For example:

```bash
nvim ~/.config/nvim/init.lua
```

is editing:

```text
~/dotfiles/nvim/.config/nvim/init.lua
```

Then commit normally:

```bash
cd ~/dotfiles
git status
git add .
git commit -m "Update dotfiles"
```
