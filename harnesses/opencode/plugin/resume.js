import { tool } from "@opencode-ai/plugin"

// Native session picker: replaces bash+prompt injection with a clean tool call.
// List sessions filtered to current worktree, so /resume shows a table not raw JSON.
export const ResumePlugin = async ({ directory, worktree, $, client }) => {
  return {
    tool: {
      open_resume: tool({
        description: "Open native opencode session picker (like Claude /resume). Use for /resume instead of list_sessions when user wants direct switch.",
        args: {},
        async execute(_args, _ctx) {
          await client.tui.openSessions()
          return "Opened native session picker. Pick a session to switch directly without restart."
        }
      }),
      list_sessions: tool({
        description: "List opencode sessions for current worktree (fallback for /resume picker). Returns top 8 filtered to this folder.",
        args: {},
        async execute(_args, _ctx) {
          const raw = await $`opencode session list --format json`.nothrow().text()
          let sessions = []
          try {
            sessions = JSON.parse(raw)
          } catch {
            return "No sessions found or failed to parse: " + raw.slice(0, 500)
          }
          // strict per-folder like Claude's /resume: only directory === cwd
          // (jangan ikut global, biar tidak bocor ke folder lain)
          const cwd = directory
          const filtered = sessions.filter(s => {
            const dir = s.directory || ""
            return dir === cwd
          })
          // sort by updated desc, take 8
          filtered.sort((a,b) => (b.updated||0) - (a.updated||0))
          const top = filtered.slice(0, 8)
          if (top.length === 0) return "No sessions in this worktree. Run: opencode -c to start new."
          // return compact table for LLM to render + pass to question tool
          return JSON.stringify(top.map(s => ({
            id: s.id,
            title: s.title || "(no title)",
            updated: new Date(s.updated).toISOString().slice(0,16).replace("T"," "),
            directory: s.directory
          })), null, 2)
        }
      })
    }
  }
}
