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
