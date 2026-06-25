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

vim.cmd.colorscheme("tokyonight-night")
