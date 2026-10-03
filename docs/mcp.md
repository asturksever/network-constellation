# Ask your network from your AI tools (MCP)

Network Constellation also runs as an [MCP](https://modelcontextprotocol.io)
server. Point it at your LinkedIn `Connections.csv` once, and Claude, Cursor,
VS Code or any other MCP client can answer questions about your network
directly in the chat:

> *Who in my network works in satellite imagery, and who's the most senior?*
>
> *I'm meeting someone from Esri next week. Who else do I know there?*
>
> *Which employers do I know the most people at in climate?*
>
> *Draft an intro request to the three VCs I know best.*

It reads the same file the web page reads, classifies it the same way, and
answers questions the same way. Nothing is uploaded to set it up: the server
runs on your own machine and reads the file from your disk.

- [Before you start: what your AI tool will see](#before-you-start-what-your-ai-tool-will-see)
- [Set it up](#set-it-up)
- [The tools](#the-tools)
- [Troubleshooting](#troubleshooting)

## Before you start: what your AI tool will see

This is different from the web page, so it's worth being clear about.

The web page never sends anyone's details anywhere. Here, **whatever a tool
returns becomes part of your conversation, so it goes to your AI tool's
provider**, as everything else you type there does. When you ask "who do I know
at Esri?", the names, job titles and employers of the matching people are sent
to the model, because that's the answer.

What the server does to keep that to what is needed:

- It returns names, job titles, employers, fields, seniority and connection
  dates, and only for the people a question matches.
- It **never** returns email addresses, even when your export has them.
- It returns LinkedIn profile links **only** if you start it with
  `--include-links`.
- It never connects to the network itself. It only reads the CSV you point it
  at.

If your AI tool lets you choose whether conversations are used for training,
that setting applies to these answers too.

## Set it up

### Claude Desktop: one click

1. [Get your export](#get-your-export) and unzip it, so you have
   `Connections.csv` on your disk.
2. Download **[network-constellation.mcpb](https://github.com/asturksever/network-constellation/releases/latest/download/network-constellation.mcpb)**.
3. Double-click it. Claude Desktop opens it and asks you to install.
4. When it asks for **LinkedIn Connections.csv**, choose `Connections.csv`.
   The picker usually opens in Downloads, right next to the extension file,
   so take care not to pick `network-constellation.mcpb` itself.
5. Check that the extension is switched on in **Settings → Extensions**.
6. Start a **new** chat. **Network Constellation** should be listed in the
   chat's tools menu. Then ask, for example, *"who in my LinkedIn network
   works at Esri?"*

You don't need Node, git or a config file: Claude Desktop runs the extension
on its own built-in runtime. To change the file later, or to turn on profile
links, open **Settings → Extensions → Network Constellation → Configure**.

Claude chooses among all the tools it has. If it also has email or calendar
connected, it may search those first. Saying "my LinkedIn network" or "use
Network Constellation" in the question settles it.

### Get your export

On LinkedIn, open
[Get a copy of your data](https://www.linkedin.com/mypreferences/d/download-my-data),
tick **Connections**, and request the archive. LinkedIn emails you when it is
ready, usually within ten minutes. Unzip it, and put `Connections.csv` somewhere it
will stay.

### Any other client, or by hand

You need [Node.js](https://nodejs.org) 18 or newer, git, and
[your export](#get-your-export). Use the **full path** to `Connections.csv`
below; a path starting with `~/` works too.

Every client runs the same command:

```bash
npx -y github:asturksever/network-constellation --csv /full/path/to/Connections.csv
```

`npx` fetches the server from GitHub the first time, which takes a few
seconds, and caches it after that. There are no dependencies to install. Or
clone the repo and run `node /path/to/network-constellation/mcp/server.mjs
--csv …` instead.

### Claude Desktop, by hand

If you'd rather not use the extension, **Settings → Developer → Edit Config** opens `claude_desktop_config.json`.
Add:

```json
{
  "mcpServers": {
    "network-constellation": {
      "command": "npx",
      "args": ["-y", "github:asturksever/network-constellation", "--csv", "/full/path/to/Connections.csv"]
    }
  }
}
```

Restart Claude Desktop, then start a new chat; the six tools are listed under the server name. On
Windows, use `"command": "cmd"` and put `"/c", "npx",` at the start of `args`.

### Claude Code

```bash
claude mcp add network-constellation --scope user -- npx -y github:asturksever/network-constellation --csv /full/path/to/Connections.csv
```

`--scope user` makes it available in every project. Without it, the server is
only available in the folder you ran the command in. Check it with `claude mcp
list`.

Claude Code and Claude Desktop keep separate lists. A server added here does
not appear in the desktop app's chats, and the desktop extension does not
appear here.

### Cursor

`~/.cursor/mcp.json` (or **Settings → MCP → Add new MCP server**):

```json
{
  "mcpServers": {
    "network-constellation": {
      "command": "npx",
      "args": ["-y", "github:asturksever/network-constellation", "--csv", "/full/path/to/Connections.csv"]
    }
  }
}
```

### VS Code (Copilot agent mode)

`.vscode/mcp.json` in a workspace, or **MCP: Open User Configuration** from
the command palette:

```json
{
  "servers": {
    "network-constellation": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:asturksever/network-constellation", "--csv", "/full/path/to/Connections.csv"]
    }
  }
}
```

### Windsurf, Gemini CLI and others

Most clients use the same `mcpServers` block as Claude Desktop:
- Windsurf: `~/.codeium/windsurf/mcp_config.json`
- Gemini CLI: `~/.gemini/settings.json`

The Codex CLI uses TOML, in `~/.codex/config.toml`:

```toml
[mcp_servers.network-constellation]
command = "npx"
args = ["-y", "github:asturksever/network-constellation", "--csv", "/full/path/to/Connections.csv"]
```

### Options

| Option | What it does |
|---|---|
| `--csv PATH` | Your export. You can also set the `NC_CSV` environment variable. |
| `--include-links` | Also return LinkedIn profile links (`NC_INCLUDE_LINKS=1` does the same). Off by default. |

When you download a newer export, replace the file and restart your client.
The server reads the file once, when it is first asked something. In Claude
Desktop, choose the new file under **Configure**, then switch the extension
off and on again.

## The tools

All six only read. None changes anything, and none connects to the internet.

| Tool | What it answers |
|---|---|
| `network_overview` | How many people, every field with its size, the seniority mix, the biggest employers. Your AI tool usually calls this first, to learn the field names. |
| `network_ask` | A plain-English question, answered the way the web page answers it. The reading of the question comes back as `interpreted_as`, so it can be checked. |
| `network_find_person` | Someone by name: role, employer, field, seniority, headline, when you connected, and who else you know at their employer. |
| `network_list_people` | People by field, employer, exact or minimum seniority, and a word in their title. Paginated. |
| `network_list_employers` | Employers ranked by how many of your connections work there, overall or within one field. |
| `network_get_employer` | Everyone you know at one employer, most senior first. |

Every tool returns readable Markdown by default and structured JSON on
request.

What it can't answer is what the export can't: **where people live**, and
**who knows whom**. LinkedIn's export has neither. A question that names a
place gets an answer that says so, instead of a made-up filter. Fields and
seniority are inferred from job titles, as on the web page, so "Other" and
"Unstated" are real answers. See
[How questions are answered](ask-your-graph.md).

## Troubleshooting

**"No export configured."** The command has no `--csv`. Add it, with the full
path, and restart your client.

**"No file at …"** The path is wrong, or it's relative. Use the full path, or
one starting with `~/`.

**"That is LinkedIn's whole download."** Unzip it and point `--csv` at the
`Connections.csv` inside.

**"The file chosen is the extension itself."** In Claude Desktop, the
extension was given `network-constellation.mcpb` as its CSV. Open
**Settings → Extensions → Network Constellation → Configure** and choose
`Connections.csv` instead.

**The extension is installed but switched off.** Claude Desktop won't start
an extension until its required settings are filled in. Choose your CSV under
**Configure**, then switch it on.

**Claude answers from email, memory or the web instead.** Network
Constellation isn't in that chat's tools menu, or Claude chose another tool.
Start a new chat after installing or changing the extension. Check that it's
listed and switched on in the tools menu, and name it in the question: *"use
Network Constellation: who do I know at Esri?"*

**The tools never appear.** If you set it up by hand, check that `node
--version` is 18 or newer and that `git` is installed: `npx` needs git to
fetch from GitHub. Then look at the logs. Claude Desktop writes them to
`~/Library/Logs/Claude/` on macOS and `%APPDATA%\Claude\logs` on Windows: the
extension's own log is `mcp-server-Network Constellation.log`, and `main.log`
says why an extension wasn't started. The server logs only to stderr, so its
lines appear there.

**Test it without a client:**

```bash
npx -y github:asturksever/network-constellation --help
npx @modelcontextprotocol/inspector npx -y github:asturksever/network-constellation --csv /full/path/to/Connections.csv
```

The second command opens the MCP Inspector in your browser, where you can call
each tool by hand.

---

Back to the [README](../README.md) · [Install and self-host](install.md) · [How questions are answered](ask-your-graph.md)
