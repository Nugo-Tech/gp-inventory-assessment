const express = require("express")
const Product = require("../models/product")

const router = new express.Router()

// Similar to the GP ERP, products are addressed by SKU.
router.get("/products", async (req, res, next) => {
  try {
    const products = await Product.find({ deleted: { $ne: true } }).sort({
      sku: 1,
    })
    res.send(products)
  } catch (error) {
    next(error)
  }
})

router.patch("/product/:sku/stock", async (req, res, next) => {
  try {
    const { sku } = req.params
    const { change } = req.body || {}
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : ""

    // isSafeInteger also rejects values like 1e300 that isInteger accepts.
    if (!Number.isSafeInteger(change) || change === 0) {
      return res.status(400).send({
        message: "Change must be a non-zero integer",
      })
    }

    if (!reason) {
      return res.status(400).send({
        message: "Reason is required",
      })
    }

    // Single atomic update: for removals the filter only matches when
    // enough stock exists, so concurrent requests cannot go negative.
    const filter = { sku, deleted: { $ne: true } }
    if (change < 0) {
      filter.stock = { $gte: -change }
    }

    const product = await Product.findOneAndUpdate(
      filter,
      {
        $inc: { stock: change },
        $push: {
          stockAdjustments: { change, reason, adjustedAt: new Date() },
        },
      },
      { new: true },
    )

    if (product) {
      return res.send(product)
    }

    const exists = await Product.exists({ sku, deleted: { $ne: true } })
    if (!exists) {
      return res.status(404).send({
        message: `Product with SKU ${sku} was not found`,
      })
    }

    res.status(409).send({
      message: "Insufficient stock for this removal",
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router
