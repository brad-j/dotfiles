# Brad's Dotfiles

Personal macOS dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

Each top-level directory is a Stow package. The directory structure inside each package mirrors `$HOME`, so running `stow <package>` from this repo creates symlinks back into the repo.

## Packages

| Package | Links to | Notes |
| --- | --- | --- |
| `nvim` | `~/.config/nvim` | Neovim Lua config and plugin lockfile. |
| `tmux` | `~/.config/tmux` | tmux config. |
| `pi` | selected `~/.pi` files | Pi coding agent settings, models, trusted dirs, extensions, and themes. |

## Layout

```text
~/dotfiles
├── nvim/
│   └── .config/nvim/
├── tmux/
│   └── .config/tmux/
└── pi/
    └── .pi/agent/
        ├── extensions/
        ├── themes/
        ├── models.json
        ├── settings.json
        └── trust.json
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
stow -nv nvim tmux pi
```

Apply the symlinks:

```bash
stow nvim tmux pi
```

## Common commands

Restow everything after changing package contents:

```bash
cd ~/dotfiles
stow -R nvim tmux pi
```

Preview a restow without changing anything:

```bash
cd ~/dotfiles
stow -nvR nvim tmux pi
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
