# My Dotfiles

Managed with GNU Stow.

## Packages

- `nvim` -> `~/.config/nvim`
- `tmux` -> `~/.config/tmux`
- `pi` -> selected `~/.pi` agent config/customizations

## Apply

```bash
cd ~/dotfiles
stow nvim tmux pi
```

Pi private/generated state is intentionally not tracked, including auth, web-search credentials, sessions, bundled binaries, and cloned package/git state.
