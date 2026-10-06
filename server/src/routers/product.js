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
  const { change, reason } = req.body

  if (!Number.isInteger(change) || change === 0) {
    return res.status(400).send({
      message: "change must be a non-zero integer",
    })
  }

  if (typeof reason !== "string" || !reason.trim()) {
    return res.status(400).send({
      message: "reason is required",
    })
  }

  try {
    const product = await Product.findOne({
      sku: req.params.sku,
      deleted: { $ne: true },
    })

    if (!product) {
      return res.status(404).send({
        message: "Product not found",
      })
    }

    if (product.stock + change < 0) {
      return res.status(409).send({
        message: "Insufficient stock",
      })
    }

    product.stock += change
    product.stockAdjustments.push({
      change,
      reason: reason.trim(),
    })

    await product.save()
    return res.send(product)
  } catch (error) {
    return next(error)
  }
})

module.exports = router
