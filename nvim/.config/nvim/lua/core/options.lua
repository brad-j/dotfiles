vim.cmd("let g:netrw_liststyle = 3")

local map = vim.keymap.set
local opt = vim.opt
local defaults = { noremap = true, silent = true }

opt.relativenumber = true
opt.number = true

-- Tabs settings
opt.tabstop = 2
opt.shiftwidth = 2
opt.expandtab = true
opt.softtabstop = 2

-- Map jk to esc
map('i', 'jk', '<esc>l', defaults)

-- Map leader to <Space>
map("n", " ", "<Nop>", { silent = true, remap = false })
vim.g.mapleader = " "

-- Using <leader> + number (1, 2, ... 9) to switch tab
for i=1,9,1
do
  map('n', '<leader>'..i, i.."gt", {})
end
map('n', '<leader>0', ":tablast<cr>", {})

-- map for quick quit, save files using leader key
---- Normal mode
map('n', '<Leader>w', ':write<CR>')
map('n', '<Leader>a', ':wqa<CR>')
map('n', '<Leader>x', ':wq<CR>')
