/** Ping desktop waktu sesi selesai atau minta izin. Model free lambat, jangan ditungguin. */
export const Notify = async ({ $ }) => ({
  event: async ({ event }) => {
    if (event.type === "session.idle") {
      await $`notify-send -a opencode -i utilities-terminal "opencode" "Sesi selesai"`.nothrow()
    }
    if (event.type === "permission.updated") {
      await $`notify-send -a opencode -u critical "opencode" "Minta izin"`.nothrow()
    }
  },
})
