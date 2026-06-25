vim.g.mapleader = " "

--fff
vim.keymap.set('n', 'ff', function() require('fff').find_files() end, { desc = 'FFFind files' })
vim.keymap.set('n', 'fg', function() require('fff').live_grep() end, { desc = 'FFFind files' })

-- Reload
vim.keymap.set("n", "<leader>rl", "<cmd>restart<cr>", { desc = "Reload config (:restart)" })

-- Yank
vim.keymap.set("x", "p", [["_dP"]], { desc = "Paste over selection without losing yanked text" })
vim.keymap.set({ "n", "v" }, "<leader>d", [["_d"]], { desc = "Delete without yanking" })

-- Indent
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv", { desc = "Moves lines up in visual selection" })
vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv", { desc = "Moves lines up down visual selection" })

vim.keymap.set("v", ">", ">gv", { desc = "Unindent and keep selection" })
vim.keymap.set("v", "<", "<gv", { desc = "Indent and keep selection" })

vim.keymap.set("n", "J", "mzJ`z", { desc = "Join lines without moving cursor" })

-- Easy Save
vim.keymap.set("n", "<leader>w", "<cmd>write<CR>", { desc = "Save file" })
vim.keymap.set("n", "<leader>q", "<cmd>quit<CR>", { desc = "Quit" })

-- General
vim.keymap.set("i", "jk", "<Esc>", { noremap = true, silent = true })
vim.keymap.set("n", "<leader>rd", "<C-r>", { desc = "Redo undo" })
vim.keymap.set("v", "<leader>ee", "<Esc>", { desc = "Escape visual mode" })

-- New line without insert mode
vim.keymap.set("n", "<leader>o", "o<Esc>", { desc = "New line below, no insert" })
vim.keymap.set("n", "<leader>O", "O<Esc>", { desc = "New line above, no insert" })

-- Split screens
vim.keymap.set("n", "<leader>vs", "<cmd>vsplit<CR>", { desc = "Split vertically" })
vim.keymap.set("n", "<leader>hs", "<cmd>split<CR>", { desc = "Split horizontally" })
vim.keymap.set("n", "<leader>ll", "<C-w>l", { desc = "Move to right window" })
vim.keymap.set("n", "<leader>hh", "<C-w>h", { desc = "Move to left window" })
vim.keymap.set("n", "<leader>kk", "<C-w>k", { desc = "Move to top window" })
vim.keymap.set("n", "<leader>jj", "<C-w>j", { desc = "Move to bottom window" })
vim.keymap.set("n", "<leader>.", "<cmd>vertical resize +10<CR>", { desc = "Increase window width" })
vim.keymap.set("n", "<leader>,", "<cmd>vertical resize -10<CR>", { desc = "Decrease window width" })

-- Unhighlight search
vim.keymap.set("n", "<Esc>", "<cmd>nohlsearch<CR>", { desc = "Clear search highlight" })
