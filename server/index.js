import { serve } from "@hono/node-server"
import { app } from "./app.js"

const port = Number(process.env.PORT || 3000)
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Cozy AI video listening on http://localhost:${info.port}`)
})
