require("vim._core.ui2").enable({})

vim.filetype.add({
    extension = {
        md = "markdown",
        markdown = "markdown",
        mdown = "markdown",
        ["kitty-session"] = "kitty",
    },
})

require("options")
require("keymaps")
require("commands")
require("pack")
require("lsp")

require("ghostty-default-style-dark").setup({})
vim.cmd.colorscheme("ghostty-default-style-dark")

local float_border = vim.api.nvim_get_hl(0, { name = "FloatBorder", link = false })
local normal = vim.api.nvim_get_hl(0, { name = "Normal", link = false })
vim.api.nvim_set_hl(0, "TinyCmdlineBorder", { fg = float_border.fg, bg = normal.bg })
