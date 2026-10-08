const express = require("express")
const cors = require("cors")
const productRouter = require("./routers/product")

const app = express()

app.use(cors())
app.use(express.json())

app.get("/health", (req, res) => {
  res.send({ status: "ok" })
})

app.use(productRouter)

app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).send({
      message: "Request body must be valid JSON",
    })
  }

  console.error(error)
  res.status(500).send({
    message: "Internal server error",
  })
})

module.exports = app
