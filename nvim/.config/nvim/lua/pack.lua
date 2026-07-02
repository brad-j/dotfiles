vim.pack.add({
    "https://github.com/folke/tokyonight.nvim",
    "https://github.com/dmtrKovalenko/fff.nvim",
    "https://github.com/stevearc/oil.nvim",
    "https://github.com/Saghen/blink.lib",
    "https://github.com/Saghen/blink.cmp",
    "https://github.com/rafamadriz/friendly-snippets",
    "https://github.com/neovim/nvim-lspconfig",
    "https://github.com/mason-org/mason.nvim",
    "https://github.com/mason-org/mason-lspconfig.nvim",
    { src = "https://github.com/nvim-treesitter/nvim-treesitter", version = "main" },
    "https://github.com/stevearc/conform.nvim",
    "https://github.com/echasnovski/mini.pairs",
    "https://github.com/nvim-lualine/lualine.nvim",
    "https://github.com/MeanderingProgrammer/render-markdown.nvim",
})

vim.api.nvim_create_autocmd("PackChanged", {
    callback = function(ev)
        local data = ev.data or {}
        local spec = data.spec or {}
        local name = spec.name
        local kind = data.kind

        if name == "fff.nvim" and (kind == "install" or kind == "update") then
            if not data.active then
                vim.cmd.packadd("fff.nvim")
            end

            require("fff.download").download_or_build_binary()
        end
    end,
})

-- Oil

require("oil").setup({
    view_options = {
        show_hidden = true,
        skip_confirm_for_simple_edits = true,
    },
})

vim.keymap.set("n", "-", "<CMD>Oil<CR>", { desc = "Open parent directory" })

-- Oil

-- fff

require("fff").setup({
    lazy_sync = true,
    frecency = {
        enabled = true,
        db_path = vim.fn.stdpath('cache') .. '/fff_nvim',
    },
    debug = { enabled = false, show_scores = true },
    prompt = "🪐 "
})

local function fff_root()
    local name = vim.api.nvim_buf_get_name(0)
    name = name:gsub('^oil://', '')
    local start = (name ~= '' and vim.fn.isdirectory(name) == 1) and name
        or (name ~= '' and vim.fs.dirname(name))
        or vim.fn.getcwd()
    return vim.fs.root(start, { '.git' }) or start
end

vim.keymap.set('n', '<leader>ff', function()
    require('fff').find_files({ cwd = fff_root(), query = '!package.json ' })
end, { desc = 'FFF Find files (excl. package.json)' })

vim.keymap.set('n', '<leader>fa', function()
    require('fff').find_files({ cwd = fff_root() })
end, { desc = 'FFF Find files (all)' })

vim.keymap.set('n', '<leader>fg', function()
    require('fff').live_grep({ cwd = fff_root() })
end, { desc = 'FFF Live Grep' })

-- fff

-- blink
require("blink.cmp").setup({
    keymap = { preset = "super-tab" },
    completion = {
        documentation = { auto_show = true },
    },
    sources = {
        default = { "lsp", "path", "snippets", "buffer" },
    },
    signature = { enabled = true },
    fuzzy = { implementation = "lua" },
})
-- blink

-- treesitter
local ts_parsers = {
    "lua", "vim", "vimdoc",
    "typescript", "tsx", "javascript",
    "json", "yaml", "html",
    "bash", "markdown", "markdown_inline",
}
require("nvim-treesitter").install(ts_parsers)

vim.g.markdown_fenced_languages = {
    "bash=sh",
    "css",
    "html",
    "javascript",
    "json",
    "lua",
    "typescript",
    "vim",
    "yaml",
}

vim.api.nvim_create_autocmd("FileType", {
    pattern = {
        "lua", "vim", "help",
        "typescript", "typescriptreact", "javascript", "javascriptreact",
        "json", "yaml", "sh", "bash", "markdown",
    },
    callback = function()
        pcall(vim.treesitter.start)
        vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
    end,
})
-- treesitter

-- render-markdown
require("render-markdown").setup({})
-- render-markdown

-- conform
require("conform").setup({
    formatters_by_ft = {
        lua = { "stylua" },
        javascript = { "prettier" },
        javascriptreact = { "prettier" },
        typescript = { "prettier" },
        typescriptreact = { "prettier" },
        json = { "prettier" },
        yaml = { "prettier" },
        html = { "prettier" },
        css = { "prettier" },
        astro = { "prettier" },
        markdown = { "prettier" },
        sh = { "shfmt" },
        bash = { "shfmt" },
    },
    format_on_save = {
        timeout_ms = 500,
        lsp_format = "fallback",
    },
})

vim.keymap.set("n", "<leader>fm", function()
    require("conform").format({ async = true, lsp_format = "fallback" })
end, { desc = "Format buffer" })
-- conform

-- mini.pairs
require("mini.pairs").setup()
-- mini.pairs

-- lualine
require("lualine").setup({
    options = {
        theme = "tokyonight",
        globalstatus = true,
        icons_enabled = false,
        component_separators = { left = "|", right = "|" },
        section_separators = { left = "", right = "" },
    },
    sections = {
        lualine_a = { "mode" },
        lualine_b = { "branch", "diff", "diagnostics" },
        lualine_c = { { "filename", path = 1 } },
        lualine_x = { "filetype" },
        lualine_y = { "progress" },
        lualine_z = { "location" },
    },
})
-- lualine
